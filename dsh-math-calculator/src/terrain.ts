/**
 * 局部地形与局地气候。
 *
 * 设计思路：**全局气候给基准，地形叠加修正**。
 * 上一层的 world.ts 已经算出了各纬度的年均温、昼长、气压。
 * 这一层回答「同一纬度下，海边/内陆/山顶/背风坡有什么不同」。
 *
 * 每个修正都对应一条能查证的物理机制，不是拍的：
 *   - 海拔降温：干绝热/湿绝热递减率
 *   - 大陆度：距海远近决定热容与温差
 *   - 海洋调节：暖流/寒流、比热差
 *   - 雨影：迎风坡抬升降水、背风坡下沉增温变干
 *   - 焚风：背风坡的干热风
 *   - 山谷风、海陆风：昼夜循环
 *   - 逆温层：谷地污染物/寒潮滞留
 *   - 雪线/林线随纬度和湿度变化
 *
 * 诚实边界：这些是**经验关系**，精度远不如上一层的代数公式。
 * 输出里必须明确标注哪些是估算。
 *
 * @module dsh-math-calculator/terrain
 */

/** 地形类型。 */
export type TerrainKind =
  | 'coastal' // 沿海
  | 'plain' // 平原
  | 'plateau' // 高原
  | 'mountain' // 山地
  | 'valley' // 谷地
  | 'desert' // 沙漠
  | 'forest' // 森林
  | 'tundra' // 苔原
  | 'island' // 岛屿
  | 'lake' // 湖畔

/** 地形参数。 */
export interface TerrainParams {
  /** 地形类型。默认 'plain'。 */
  kind?: TerrainKind
  /** 海拔 m。默认 0。 */
  elevation?: number
  /** 距海岸距离 km。默认 50。 */
  distanceToSea?: number
  /** 纬度（度）。默认 40。 */
  latitudeDeg?: number
  /** 该纬度的年均温（K），通常由 world 层给出。默认 288。 */
  baseTempK?: number
  /** 年降水量 mm。默认 800。 */
  annualPrecipMm?: number
  /** 相对湿度 0-1。默认 0.6。 */
  humidity?: number
  /** 主导风是否把水汽带来：1=迎风，-1=背风。默认 1。 */
  windward?: number
  /** 山峰相对高度 m（用于雨影/焚风）。默认 0。 */
  reliefHeight?: number
  /** 洋流性质：'warm' | 'cold' | 'none'。默认 'none'。 */
  oceanCurrent?: 'warm' | 'cold' | 'none'
  /** 地表材料（影响反照率与热容）。默认 'soil'。 */
  surface?: 'soil' | 'sand' | 'rock' | 'ice' | 'water' | 'vegetation'
}

/** 局地气候结果。 */
export interface TerrainClimatology {
  terrain: {
    kind: TerrainKind
    elevationM: number
    /** 该地点的实际年均温 K。 */
    meanTempK: number
    meanTempC: number
    /** 按地形修正后与基准温度的差值 K。 */
    tempAnomaly: number
    /** 昼夜温差 K（大陆度、海拔、湿度共同决定）。 */
    diurnalRangeK: number
    /** 年温差 K（夏冬差）。 */
    seasonalRangeK: number
    /** 修正后的年降水量 mm。 */
    annualPrecipMm: number
    /** 降水季节分布描述。 */
    precipPattern: string
    /** 相对湿度修正后。 */
    humidity: number
    /** 生长季长度（天，日均温 > 5°C）。 */
    growingSeasonDays: number
    /** 无霜期（天）。 */
    frostFreeDays: number
    /** 雪线高度 m。 */
    snowLineM: number
    /** 林线高度 m。 */
    treeLineM: number
    /** 潜在蒸散量 mm/年。 */
    potentialEvapotranspiration: number
    /** 干旱指数（<0.5 湿润，>0.8 干旱）。 */
    aridityIndex: number
    /** 土壤类型倾向。 */
    soilProfile: string
    /** 是否宜居描述。 */
    habitability: string
  }
  /** 地形特有的气候现象。 */
  phenomena: string[]
  /** 对读者可见的直观描述。 */
  visibleEffects: string[]
}

/** 取参数或默认。 */
function num(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * 干绝热递减率 ≈ 9.8 K/km；湿绝热 ≈ 5~6 K/km。
 * 湿度越大，抬升时凝结放热越多，实际递减率越接近湿绝热。
 */
function lapseRateKPerKm(humidity: number): number {
  const dry = 9.8
  const wet = 5.0
  return dry + (wet - dry) * Math.min(1, Math.max(0, humidity))
}

/**
 * 海拔降温。
 * 用所在湿度的绝热递减率，而不是固定 6.5 K/km —— 沙漠里的山降温更猛。
 */
function elevationTempDrop(elevationM: number, humidity: number): number {
  return (elevationM / 1000) * lapseRateKPerKm(humidity)
}

/**
 * 大陆度：距海越远，热容越小，昼夜与年温差越大。
 * 用指数衰减（距海 0 km → 海洋性；>1000 km → 极端大陆性）。
 */
function continentality(distanceToSeaKm: number): number {
  // 0 = 完全海洋性，1 = 极端大陆性
  return 1 - Math.exp(-distanceToSeaKm / 400)
}

/**
 * 海洋调节带来的温度修正。
 * 暖流使沿岸显著偏暖（北欧、日本），寒流使沿岸偏冷（秘鲁、纳米比亚）。
 * 强度随距离海的距离衰减。
 */
function oceanCurrentAnomaly(
  current: 'warm' | 'cold' | 'none',
  distanceToSeaKm: number,
  latitudeDeg: number,
): number {
  if (current === 'none') return 0
  // 暖流在高纬影响最大（那里本来冷，暖流对比强烈）
  const latitudeFactor = 0.5 + Math.abs(latitudeDeg) / 90
  const base = current === 'warm' ? 4.5 : -3.5
  return base * latitudeFactor * Math.exp(-distanceToSeaKm / 150)
}

/**
 * 雨影效应。
 * 迎风坡抬升冷却凝结 → 降水多；背风坡下沉增温 → 干热（焚风）。
 *
 * 参数化：reliefHeight 越高、风向越背风，降水损失越大。
 */
function rainShadow(
  windward: number,
  reliefHeight: number,
  precipMm: number,
): { precip: number; temperatureBoost: number; label: string } {
  if (reliefHeight <= 0) return { precip: precipMm, temperatureBoost: 0, label: '无明显地形屏障' }

  const reliefKm = Math.min(5, reliefHeight / 1000)

  if (windward > 0) {
    // 迎风坡：抬升增雨，约每 100m 增加 5~10%
    const boost = Math.min(1.8, 1 + reliefKm * 0.35)
    return {
      precip: precipMm * boost,
      temperatureBoost: -0.3 * reliefKm,
      label: `迎风坡，地形抬升使降水增加约 ${((boost - 1) * 100).toFixed(0)}%`,
    }
  }

  // 背风坡：焚风效应，降水骤减、气温升高
  const loss = Math.min(0.85, reliefKm * 0.22)
  const fohnBoost = 1.5 * reliefKm // 焚风可增温 1~2K/100m 量级
  return {
    precip: precipMm * (1 - loss),
    temperatureBoost: fohnBoost,
    label: `背风坡雨影，降水减少约 ${(loss * 100).toFixed(0)}%，并有焚风增温`,
  }
}

/**
 * 潜在蒸散量（Thornthwaite 简化式）。
 * 与温度、日照、纬度相关；这里用温度驱动的指数近似。
 */
function potentialEvapotranspiration(meanTempC: number, latitudeDeg: number): number {
  if (meanTempC < 0) return 0
  // 温度因子
  const tempFactor = Math.pow(meanTempC / 15, 1.6)
  // 纬度因子：低纬日照强、蒸发强
  const latFactor = Math.max(0.3, Math.cos((Math.abs(latitudeDeg) * Math.PI) / 180))
  // 经验标定：地球中纬温带（年均 10°C，45°）约 600mm/年
  return 600 * tempFactor * latFactor
}

/** 生长季长度：日均温 > 5°C 的天数。 */
function growingSeason(meanTempC: number, seasonalRangeK: number): number {
  // 若年均温远高于阈值，全年可生长
  if (meanTempC - seasonalRangeK > 5) return 365
  if (meanTempC + seasonalRangeK < 5) return 0

  // 用正弦年循环估算超过 5°C 的半周期比例
  const amplitude = Math.max(0.1, seasonalRangeK)
  const threshold = (5 - meanTempC) / amplitude
  if (threshold <= -1) return 365
  if (threshold >= 1) return 0
  // acos 给出半个跨越区间
  const fraction = Math.acos(threshold) / Math.PI
  return Math.round(fraction * 365)
}

/** 无霜期：日均温 > 0°C 的天数。 */
function frostFreeDays(meanTempC: number, seasonalRangeK: number): number {
  const amplitude = Math.max(0.1, seasonalRangeK)
  const threshold = (0 - meanTempC) / amplitude
  if (threshold <= -1) return 365
  if (threshold >= 1) return 0
  return Math.round((Math.acos(threshold) / Math.PI) * 365)
}

/** 土壤倾向。 */
function soilProfile(
  tempC: number,
  precipMm: number,
  evapotranspiration: number,
  surface: string,
): string {
  if (surface === 'ice') return '永久冻土/冰原'

  const aridity = precipMm / Math.max(1, evapotranspiration)

  // 干旱判定优先于地表材质：沙漠即使表面是沙，成土类型仍是干旱土
  if (aridity < 0.3) {
    return surface === 'sand'
      ? '干旱土（砂质、盐碱化倾向、有机质极少）'
      : '干旱土（薄层、盐碱化倾向）'
  }
  if (surface === 'rock') return '裸露岩石，几乎无成土作用'
  if (surface === 'sand') return '砂质土，保水差、肥力低'

  if (aridity < 0.6) return '半干旱土（草原土/栗钙土）'
  if (tempC < 0) return '冻土（有泥炭积累）'
  if (tempC < 10) return '灰化土/针叶林土（酸性、有机质层厚）'
  // 红壤/砖红壤需要高温 + 强淋溶，缺一不可。
  // 只看 aridity 会出错：58° 温带的湿润沿海也会算出 4.2 的干旱指数，
  // 但年均温只有 15°C，不可能是砖红壤。
  if (tempC > 22 && aridity > 1.2) return '红壤/砖红壤（高温强淋溶，养分流失）'
  if (tempC >= 10 && aridity > 1.2) return '湿润温带森林土（淋溶中等，酸性）'
  return '温带森林土/黑土（肥沃）'
}

/** 宜居性一句话评价。 */
function habitabilityLabel(
  tempC: number,
  precipMm: number,
  growingDays: number,
  aridity: number,
): string {
  if (tempC < -10) return '极寒，仅适合有极地适应能力的族群'
  if (tempC > 35) return '酷热，需依赖荫蔽与水源'
  if (aridity < 0.3) return '干旱，农业需灌溉或转为游牧'
  if (growingDays < 90) return '生长季过短，只能狩猎/放牧'
  if (growingDays > 300 && aridity > 0.6) return '宜居，可支撑集约农业与密集人口'
  if (growingDays > 180) return '较宜居，适合定居农业'
  return '边缘宜居，适合半定居或牧业'
}

/**
 * 主函数：计算某一地点的局地气候。
 */
export function describeTerrain(params: TerrainParams): TerrainClimatology {
  const kind = params.kind ?? 'plain'
  const elevationM = Math.max(0, num(params.elevation, 0))
  const distanceToSea = Math.max(0, num(params.distanceToSea, 50))
  const latitudeDeg = num(params.latitudeDeg, 40)
  const baseTempK = num(params.baseTempK, 288)
  const basePrecip = Math.max(0, num(params.annualPrecipMm, 800))
  const humidity = Math.min(1, Math.max(0.05, num(params.humidity, 0.6)))
  const windward = num(params.windward, 1) >= 0 ? 1 : -1
  const reliefHeight = Math.max(0, num(params.reliefHeight, 0))
  const oceanCurrent = params.oceanCurrent ?? 'none'
  const surface = params.surface ?? 'soil'

  const phenomena: string[] = []
  const visibleEffects: string[] = []

  // ── 1. 海拔降温 ──
  const lapse = lapseRateKPerKm(humidity)
  const elevationDrop = elevationTempDrop(elevationM, humidity)
  if (elevationM > 500) {
    phenomena.push(
      `海拔 ${elevationM.toFixed(0)}m，按 ${lapse.toFixed(1)} K/km 递减率降温约 ${elevationDrop.toFixed(1)}K。` +
        (humidity > 0.7 ? '（湿度高，接近湿绝热，降温较缓）' : '（干燥，接近干绝热，降温更猛）'),
    )
  }

  // ── 2. 大陆度 ──
  const cont = continentality(distanceToSea)
  // 昼夜温差：海洋性约 6K，极端大陆性可达 20K
  let diurnalRangeK = 6 + cont * 14
  // 年温差：海洋性约 8K，大陆性可达 40K
  let seasonalRangeK = 8 + cont * 32

  // 高海拔也会加大昼夜温差（空气稀薄、保温差）
  diurnalRangeK += Math.min(10, (elevationM / 1000) * 2.5)

  if (cont > 0.7) {
    phenomena.push(
      `距海 ${distanceToSea.toFixed(0)}km，大陆度 ${cont.toFixed(2)}：` +
        `昼夜温差约 ${diurnalRangeK.toFixed(0)}K，年温差约 ${seasonalRangeK.toFixed(0)}K，"早穿皮袄午穿纱"。`,
    )
    visibleEffects.push('昼夜温差极大，旅人需备昼夜两套衣物')
  } else if (cont < 0.2) {
    phenomena.push(`距海仅 ${distanceToSea.toFixed(0)}km，海洋性气候：温差被水体热容大幅平抑。`)
    visibleEffects.push('四季温和，海滨常有晨雾')
  }

  // ── 3. 洋流 ──
  const currentAnomaly = oceanCurrentAnomaly(oceanCurrent, distanceToSea, latitudeDeg)
  if (Math.abs(currentAnomaly) > 0.5) {
    if (oceanCurrent === 'warm') {
      phenomena.push(`沿岸暖流，使均温偏高约 ${currentAnomaly.toFixed(1)}K（同纬度罕见的不冻港）。`)
      visibleEffects.push('高纬港口终年不冻，海水温暖、雾气弥漫')
    } else {
      phenomena.push(`沿岸寒流，使均温偏低约 ${Math.abs(currentAnomaly).toFixed(1)}K，且多雾少雨。`)
      visibleEffects.push('海岸多雾、干燥，近海有冷水上升带来的富营养渔场')
    }
  }

  // ── 4. 雨影与焚风 ──
  const shadow = rainShadow(windward, reliefHeight, basePrecip)
  if (reliefHeight > 300) {
    phenomena.push(shadow.label + '。')
    if (windward < 0 && shadow.temperatureBoost > 1) {
      visibleEffects.push('背风坡有干热焚风，可致雪崩式融雪与火灾风险')
    } else if (windward > 0) {
      visibleEffects.push('迎风坡常年云雾缭绕、植被茂密')
    }
  }

  // ── 5. 合成温度 ──
  const meanTempK = baseTempK - elevationDrop + currentAnomaly + shadow.temperatureBoost
  const meanTempC = meanTempK - 273.15
  const tempAnomaly = meanTempK - baseTempK

  // ── 6. 降水与湿度 ──
  const annualPrecipMm = Math.max(0, shadow.precip)
  // 背风坡湿度下降
  const effectiveHumidity = Math.min(1, Math.max(0.05, humidity * (annualPrecipMm / Math.max(1, basePrecip)) ** 0.3))

  // 降水季节分布
  let precipPattern = '降水均匀'
  if (windward > 0 && reliefHeight > 500) precipPattern = '迎风坡全年多雨，无显著干季'
  else if (windward < 0) precipPattern = '背风坡显著干季，降水集中在少数月份'
  else if (cont > 0.7) precipPattern = '大陆性降水，夏季集中、冬季干旱'
  else if (Math.abs(latitudeDeg) < 15) precipPattern = '对流雨为主，午后雷阵雨常见'
  else if (Math.abs(latitudeDeg) > 60) precipPattern = '降水稀少，以降雪为主'

  // ── 7. 蒸散与干旱指数 ──
  const pet = potentialEvapotranspiration(meanTempC, latitudeDeg)
  const aridity = annualPrecipMm / Math.max(1, pet)

  if (aridity < 0.35 && annualPrecipMm > 0) {
    phenomena.push(`干旱指数 ${aridity.toFixed(2)}（<0.35），蒸散远超降水，需依赖地下水/河流。`)
  } else if (aridity > 1.2) {
    phenomena.push(`干旱指数 ${aridity.toFixed(2)}（>1.2），降水充沛，淋溶强烈、易沼泽化。`)
  }

  // ── 8. 生长季与无霜期 ──
  const growingDays = growingSeason(meanTempC, seasonalRangeK)
  const frostFree = frostFreeDays(meanTempC, seasonalRangeK)

  // ── 9. 雪线与林线 ──
  // 雪线 = 从该地「海拔 0 处的年均温」起，升到温度降至 0°C 的高度。
  // 注意不能用 meanTempK（已经含当前海拔的降温），否则高海拔地点的雪线会算成 0。
  // 正确做法：先还原该地点所在纬度、海平面处的温度，再除以递减率。
  const seaLevelTempC = baseTempK - 273.15 + currentAnomaly + shadow.temperatureBoost
  const snowLineM = seaLevelTempC > 0 ? (seaLevelTempC / lapse) * 1000 : 0
  // 林线：约相当于最热月均温 10°C 的上限，比雪线低约 (10/lapse) 米
  const treeLineM = seaLevelTempC > 10 ? ((seaLevelTempC - 10) / lapse) * 1000 : 0

  if (snowLineM > 0 && elevationM > snowLineM) {
    phenomena.push(`该地点海拔 ${elevationM.toFixed(0)}m 已高于雪线（${snowLineM.toFixed(0)}m），终年积雪或冰川覆盖。`)
    visibleEffects.push('六七月仍有积雪，溪流源自冰川融水、水色乳白冰凉')
  } else if (treeLineM > 0 && elevationM > treeLineM) {
    phenomena.push(`该地点高于林线（${treeLineM.toFixed(0)}m），只有草甸与裸岩，无乔木生长。`)
    visibleEffects.push('越过某条高度后树木突然消失，只剩矮草与裸岩')
  }

  // ── 10. 逆温（谷地特有）──
  if (kind === 'valley' && elevationM > 0) {
    phenomena.push('谷地夜间易形成逆温层：冷空气沿山坡下沉积聚，谷底比坡上更冷，烟雾和污染物滞留不易扩散。')
    visibleEffects.push('清晨谷底浓雾、炊烟不散，高处反而晴朗温暖')
  }

  // ── 11. 海陆风 / 山谷风 ──
  if (kind === 'coastal' && distanceToSea < 20) {
    phenomena.push('海陆风环流：白天风从海吹向陆，夜间反向。沿海午后凉爽、夜间温和。')
    visibleEffects.push('午后海风带来凉意与咸腥味，夜里陆风把陆地气息吹向海面')
  }
  if ((kind === 'mountain' || kind === 'valley') && elevationM > 300) {
    phenomena.push('山谷风：白天谷风沿坡上升（易成云），夜间山风下沉（晴空）。')
  }

  // ── 12. 地形本身的直观影响 ──
  if (kind === 'island' && distanceToSea < 50) {
    phenomena.push('岛屿面积有限、海洋调节强：温差小但淡水储量受限于集水面积。')
    visibleEffects.push('四周皆是海平线，淡水依赖山泉与雨水收集')
  }
  if (surface === 'sand' || kind === 'desert') {
    phenomena.push('砂质地表反照率高、热容小：正午升温极快，日落后迅速散热。')
    visibleEffects.push('正午沙面灼热难行，夜间骤冷需厚衣')
  }
  if (surface === 'vegetation' || kind === 'forest') {
    phenomena.push('植被覆盖提高蒸腾：湿度上升、白天略降温、夜间略保温。')
  }

  // ── 13. 高纬现象 ──
  if (Math.abs(latitudeDeg) > 60 && kind === 'tundra') {
    phenomena.push('苔原带：地下有永久冻土，夏季表层融化形成沼泽，树木无法扎根。')
    visibleEffects.push('夏季地表泥泞、蚊虫极多；冬季地表坚硬如石')
  }

  // 极昼极夜的补充说明
  if (Math.abs(latitudeDeg) > 66.5) {
    phenomena.push('位于极圈内：一年中存在极昼与极夜，日照的极端变化主导当地生活节律。')
  }

  return {
    terrain: {
      kind,
      elevationM,
      meanTempK,
      meanTempC,
      tempAnomaly,
      diurnalRangeK,
      seasonalRangeK,
      annualPrecipMm,
      precipPattern,
      humidity: effectiveHumidity,
      growingSeasonDays: growingDays,
      frostFreeDays: frostFree,
      snowLineM,
      treeLineM,
      potentialEvapotranspiration: pet,
      aridityIndex: aridity,
      soilProfile: soilProfile(meanTempC, annualPrecipMm, pet, surface),
      habitability: habitabilityLabel(meanTempC, annualPrecipMm, growingDays, aridity),
    },
    phenomena,
    visibleEffects,
  }
}
