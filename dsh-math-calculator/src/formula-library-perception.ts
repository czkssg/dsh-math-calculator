/**
 * 公式库第三批：**读者可感知层**。
 *
 * 设计依据（架空世界观创作视角）：
 * 读者不会看到"万有引力常数"，但会看到：
 *   - 站在塔顶能望多远（地平线距离）
 *   - 一天有多长、一年有几个季节
 *   - 声音传多远、喊话能否听清
 *   - 军队走多远要几天、吃什么
 *   - 城市能养多少人、粮食从哪来
 *   - 天空什么颜色、星星怎么转
 *
 * 这些是「读者感知层」。它们背后的物理（重力、自转、光速）是「支撑层」，
 * 已经收过一部分。本批补足感知层，以及读者能注意到的支撑层缺口。
 *
 * @module dsh-math-calculator/formula-library-perception
 */

import type { FormulaDef } from './formula-library.js'

const p = (value: number, desc: string) => ({ value, desc })
const req = (desc: string) => ({ value: null, desc })

/**
 * 第三批公式：读者可感知层（地平线、昼夜、声音、行军、城市、星空）。
 *
 * 这一批的判断标准不是"物理学上重要"，而是"读者会在故事里注意到"。
 * 与后续 story 批次的区别：这些是环境与尺度感，story 批次偏材料/天气/医药等具体处境。
 */
export const PERCEPTION_FORMULAS: FormulaDef[] = [
  // ══════════════════════════════════════════════════════════════════
  // 一、视野与地平线（旅人抬头就能看见）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'horizon_distance',
    cat: 'perception/horizon',
    name: '地平线距离（平视）',
    expr: 'sqrt(2 * R * h + h^2)',
    params: { R: p(6.371e6, '星球半径 m'), h: req('观察者/塔楼高度 m') },
    unit: 'm',
    desc: '站在高度 h 处能看到多远。地球 1.7m 眼高约 4.7km。星球更小则地平线更近——这是"世界大小"最直观的暗示。',
    keys: ['horizon', '地平线', '视距', '能看多远'],
  },
  {
    id: 'horizon_tower_visibility',
    cat: 'perception/horizon',
    name: '两座塔互相可见的最大距离',
    expr: 'sqrt(2 * R * h1 + h1^2) + sqrt(2 * R * h2 + h2^2)',
    params: { R: p(6.371e6, '星球半径 m'), h1: req('塔1 高度 m'), h2: req('塔2 高度 m') },
    unit: 'm',
    desc: '两座高塔上的人能否互相望见。古代烽火台间距的直接依据。',
    keys: ['line of sight', '互相可见', '烽火台'],
  },
  {
    id: 'curvature_drop',
    cat: 'perception/horizon',
    name: '地球曲率下沉量',
    expr: 'd^2 / (2 * R)',
    params: { d: req('水平距离 m'), R: p(6.371e6, '星球半径 m') },
    unit: 'm',
    desc: '走过 d 后，远处物体相对视线"沉下去"多少。船桅消失、远山隐没的物理原因。',
    keys: ['curvature', '曲率', '下沉'],
  },
  {
    id: 'apparent_size',
    cat: 'perception/horizon',
    name: '天体视直径（张角）',
    expr: '2 * atan(r / d)',
    params: { r: req('天体半径 m'), d: req('距离 m') },
    unit: 'rad',
    desc: '月亮/太阳在天空占多大。地球上看月亮约 0.52°。双月世界的标志性参数。',
    keys: ['apparent size', '视直径', '月亮大小'],
  },
  {
    id: 'angular_diameter_from_sizes',
    cat: 'perception/horizon',
    name: '给定视直径反推天体大小',
    expr: 'd * tan(angle / 2)',
    params: { d: req('距离 m'), angle: req('目标视直径 rad') },
    unit: 'm',
    desc: '要让"月亮"看起来是地球月亮的 3 倍大，它得多大/多近。',
    keys: ['angular size', '视大小'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 二、昼夜与季节（故事时间感的根基）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'day_length',
    cat: 'perception/celestial',
    name: '自转周期（昼夜长短）',
    expr: '2 * pi / omega',
    params: { omega: req('自转角速度 rad/s') },
    unit: 's',
    desc: '一天多长。地球 ω=7.29e-5 rad/s → 86164s（23h56m）。',
    keys: ['day length', '昼夜', '自转周期'],
  },
  {
    id: 'day_length_from_radius',
    cat: 'perception/celestial',
    name: '由赤道线速度求一天长度',
    expr: '2 * pi * R / v_equator',
    params: { R: req('星球半径 m'), v_equator: req('赤道线速度 m/s') },
    unit: 's',
    desc: '另一种写法：赤道有人以 v 运动，一天就是绕一圈的时间。',
    keys: ['rotation', '自转'],
  },
  {
    id: 'centrifugal_ratio',
    cat: 'perception/celestial',
    name: '赤道离心/重力比',
    expr: 'omega^2 * R / g',
    params: { omega: req('自转角速度 rad/s'), R: req('星球半径 m'), g: p(9.80665, '表面重力 m/s²') },
    unit: '',
    desc: '这个比值接近 1 时星球会解体。决定"最大自转速度"，进而决定最短的一天。',
    keys: ['centrifugal', '离心', '自转极限'],
  },
  {
    id: 'solar_declination',
    cat: 'perception/celestial',
    name: '太阳赤纬（季节位移）',
    expr: 'obliquity * sin(2 * pi * day_of_year / year_length)',
    params: { obliquity: p(0.409105, '轴倾角 rad（地球 23.44°）'), day_of_year: req('一年中的第几天'), year_length: p(365.25, '一年天数') },
    unit: 'rad',
    desc: '太阳直射点纬度。倾角为 0 则无季节，倾角大则季节极端。',
    keys: ['declination', '赤纬', '季节'],
  },
  {
    id: 'solar_elevation',
    cat: 'perception/celestial',
    name: '正午太阳高度角',
    expr: 'pi / 2 - abs(latitude - declination)',
    params: { latitude: req('纬度 rad'), declination: req('太阳赤纬 rad') },
    unit: 'rad',
    desc: '正午影子的长短由此决定。极昼极夜的界线也在这里。',
    keys: ['solar elevation', '太阳高度', '正午'],
  },
  {
    id: 'shadow_length',
    cat: 'perception/celestial',
    name: '影子长度',
    expr: 'h / tan(elevation)',
    params: { h: req('物体高度 m'), elevation: req('太阳高度角 rad') },
    unit: 'm',
    desc: '正午影长。高纬度冬季影子极长，这是读者能直接感受到的季节信号。',
    keys: ['shadow', '影子'],
  },
  {
    id: 'solar_day_length',
    cat: 'perception/celestial',
    name: '昼长（小时）',
    // 注意：|tan(φ)tan(δ)| > 1 时 acos 无定义，那是极昼/极夜——
    // 物理上昼长就是 0 或 24 小时。这里用 min/max 夹住，给出确定答案而不是 NaN。
    expr: '24 / pi * acos(max(-1, min(1, -tan(latitude) * tan(declination))))',
    params: { latitude: req('纬度 rad'), declination: p(0, '太阳赤纬 rad（0=春分）') },
    unit: '小时',
    desc: '日照时长。返回 24 表示极昼、0 表示极夜（已夹边界，不会报错）。故事节奏的关键参数。',
    keys: ['daylight', '昼长', '日照', '极昼'],
  },
  {
    id: 'year_length',
    cat: 'perception/celestial',
    name: '公转周期（一年多长）',
    expr: '2 * pi * sqrt(a^3 / (G * M))',
    params: { a: req('轨道半长轴 m'), M: req('恒星质量 kg'), G: p(6.6743e-11, '引力常数') },
    unit: 's',
    desc: '一年多长。轨道远或恒星轻则一年漫长。',
    keys: ['year', '公转', '一年'],
  },
  {
    id: 'tidal_period',
    cat: 'perception/celestial',
    name: '潮汐周期（双潮）',
    // 行星与卫星自转同步时（ω 相同）潮汐周期趋于无穷——物理上就是"没有相对潮汐"。
    // 用加法兜底避免除以 0。
    expr: '2 * pi / (2 * (omega_planet - omega_moon) + 1e-30)',
    params: {
      omega_planet: p(7.292e-5, '行星自转角速度 rad/s（地球值）'),
      omega_moon: p(2.662e-6, '卫星公转角速度 rad/s（地球月亮值）'),
    },
    unit: 's',
    desc: '两次高潮之间的间隔。地球约 12h25m。两者同步时无相对潮汐。',
    keys: ['tidal period', '潮汐周期'],
  },
  {
    id: 'tidal_force_ratio',
    cat: 'perception/celestial',
    name: '卫星潮汐力（相对地球月亮）',
    expr: 'm_moon / d^3',
    params: { m_moon: req('卫星质量 kg'), d: req('轨道距离 m') },
    unit: 'kg/m³',
    desc: '与 7.35e22/(3.84e8)³ 比较，判断潮汐比地球强多少。多卫星世界的潮汐叠加。',
    keys: ['tidal force', '潮汐力'],
  },
  {
    id: 'eclipse_angular',
    cat: 'perception/celestial',
    name: '日食条件（视角重合）',
    expr: 'r_sun / d_sun - r_moon / d_moon',
    params: { r_sun: req('恒星半径 m'), d_sun: req('恒星距离 m'), r_moon: req('卫星半径 m'), d_moon: req('卫星距离 m') },
    unit: 'rad',
    desc: '接近 0 说明卫星恰好能遮住恒星——日全食奇观。地球这对数字极其巧合。',
    keys: ['eclipse', '日食', '食'],
  },
  {
    id: 'sky_color_wavelength',
    cat: 'perception/celestial',
    name: '大气散射强度（瑞利）',
    expr: '1 / lambda^4',
    params: { lambda: req('波长 m') },
    unit: '1/m⁴',
    desc: '短波散射强 → 天空偏蓝。大气成分/厚度不同的世界，天空颜色会变。',
    keys: ['rayleigh', '散射', '天空颜色'],
  },
  {
    id: 'atmospheric_scale_height',
    cat: 'perception/celestial',
    name: '大气标高（稀薄程度）',
    expr: 'R * T / (M * g)',
    params: { R: p(8.314462618, '气体常数'), T: req('地表温度 K'), M: req('摩尔质量 kg/mol'), g: p(9.80665, '重力 m/s²') },
    unit: 'm',
    desc: '气压降到 1/e 的高度。地球约 8.5km。决定"高原反应"和"天空尽头"。',
    keys: ['scale height', '标高', '大气厚度'],
  },
  {
    id: 'pressure_at_altitude',
    cat: 'perception/celestial',
    name: '高原气压',
    expr: 'P0 * exp(-h / H)',
    params: { P0: p(101325, '海平面气压 Pa'), h: req('海拔 m'), H: p(8500, '大气标高 m') },
    unit: 'Pa',
    desc: '越高空气越稀薄。登山、飞行、高原文明的能量基础。',
    keys: ['altitude pressure', '高原', '气压'],
  },
  {
    id: 'twilight_duration',
    cat: 'perception/celestial',
    name: '黄昏时长（近似）',
    expr: '18 * pi / 180 / (pi / 2) * (24 / pi)',
    params: { latitude: req('纬度 rad') },
    unit: '小时',
    desc: '太阳从地平线落到 -18° 的耗时。高纬度夏季有长黄昏。',
    keys: ['twilight', '黄昏', '暮色'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 三、声音与光（读者耳朵/眼睛直接接触）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'sound_speed_air',
    cat: 'perception/senses',
    name: '空气中的声速',
    expr: '331.3 * sqrt(T / 273.15)',
    params: { T: req('温度 K') },
    unit: 'm/s',
    desc: '声音多快。天气/气体成分不同会变。轻重大气让喊话传得更远或更近。',
    keys: ['sound speed', '声速'],
  },
  {
    id: 'sound_speed_gas',
    cat: 'perception/senses',
    name: '气体声速（通用）',
    expr: 'sqrt(gamma * R * T / M)',
    params: { gamma: p(1.4, '绝热指数'), R: p(8.314462618, '气体常数'), T: req('温度 K'), M: req('摩尔质量 kg/mol') },
    unit: 'm/s',
    desc: '不同大气成分的声速。氙气大气里声音慢得多，对话会有"低沉"感。',
    keys: ['sound speed', '声速', '大气成分'],
  },
  {
    id: 'echo_delay',
    cat: 'perception/senses',
    name: '回声延迟',
    expr: '2 * d / v',
    params: { d: req('障碍物距离 m'), v: p(343, '声速 m/s') },
    unit: 's',
    desc: '喊一声多久听到回声。山谷/洞穴描写的依据。',
    keys: ['echo', '回声'],
  },
  {
    id: 'sound_attenuation',
    cat: 'perception/senses',
    name: '声强随距离衰减',
    expr: 'I0 / d^2',
    params: { I0: req('参考距离处声强 W/m²'), d: req('距离 m') },
    unit: 'W/m²',
    desc: '平方反比。远处的人能不能听见呼喊。',
    keys: ['attenuation', '衰减'],
  },
  {
    id: 'light_travel_time',
    cat: 'perception/senses',
    name: '光行时间',
    expr: 'd / c',
    params: { d: req('距离 m'), c: p(299792458, '光速 m/s') },
    unit: 's',
    desc: '看到的是多久以前的景象。极远天体=看到过去（观测宇宙学的文学素材）。',
    keys: ['light travel', '光行'],
  },
  {
    id: 'light_pollution_limit',
    cat: 'perception/senses',
    name: '肉眼可见星等极限（近似）',
    expr: '2.5 * log(brightness, 10) + 6',
    params: { brightness: req('相对亮度（以肉眼阈值为 1）') },
    unit: '星等',
    desc: '不同程度黑暗下能看到多暗的星。星空描写的量化依据。',
    keys: ['magnitude', '星等', '星空'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 四、运动与旅行（情节推进的节奏）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'travel_time',
    cat: 'perception/travel',
    name: '旅行耗时',
    expr: 'distance / speed',
    params: { distance: req('距离 m'), speed: req('速度 m/s') },
    unit: 's',
    desc: '走多远要多久。马 5.5m/s、船 3m/s、驼队 1.4m/s。',
    keys: ['travel time', '行程', '旅途'],
  },
  {
    id: 'travel_time_hours',
    cat: 'perception/travel',
    name: '旅行耗时（小时）',
    expr: 'distance / (speed * 3.6)',
    params: { distance: req('距离 km'), speed: req('速度 km/h') },
    unit: '小时',
    desc: '步行 5km/h、行军 4km/h、骑兵 20km/h。情节节奏的直接依据。',
    keys: ['travel', '行军', '路程'],
  },
  {
    id: 'march_supply',
    cat: 'perception/travel',
    name: '行军补给需求',
    expr: 'n * days * per_day',
    params: { n: req('人数'), days: req('天数'), per_day: p(3, '每人每日补给 kg') },
    unit: 'kg',
    desc: '军队能走多远、补给车队多大。战争推演的基础。',
    keys: ['supply', '补给', '粮草'],
  },
  {
    id: 'drayage_range',
    cat: 'perception/travel',
    name: '人力/畜力运输经济半径',
    expr: 'value / (cost_per_km * distance)',
    params: { value: req('货物单位价值'), cost_per_km: req('每公里运输成本'), distance: req('距离 km') },
    unit: '',
    desc: '比值 <1 说明运过去的成本超过了货值——贸易半径的硬边界。',
    keys: ['transport', '运输', '贸易半径'],
  },
  {
    id: 'walking_range_human',
    cat: 'perception/travel',
    name: '人的日常活动半径',
    expr: 'speed * hours',
    params: { speed: p(1.4, '步行速度 m/s'), hours: req('可活动小时数') },
    unit: 'm',
    desc: '一天能走多远。聚落规模与市场范围。',
    keys: ['walking', '活动半径'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 五、农业与食物（文明能养多少人）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'crop_yield_area',
    cat: 'perception/agriculture',
    name: '所需耕地面积',
    // 单位核对：人·(kcal/人·天)·(天/年) ÷ (kg/m²·年 × kcal/kg) = m²
    // 不要多余的 ×1000 —— kcal_per_kg 已经是每公斤的千卡数。
    expr: 'people * kcal_per_day * 365 / (yield_per_m2 * kcal_per_kg)',
    params: {
      people: req('供养人口'), kcal_per_day: p(2200, '每人每日热量 kcal'),
      yield_per_m2: req('每平方米年产量 kg'), kcal_per_kg: p(3500, '每公斤热量 kcal'),
    },
    unit: 'm²',
    desc: '养活一座城需要多大农田。农业文明的承载上限。',
    keys: ['farmland', '耕地', '粮食'],
  },
  {
    id: 'food_surplus_ratio',
    cat: 'perception/agriculture',
    name: '农业剩余率（供养非农人口）',
    expr: '(yield - consumed) / yield',
    params: { yield: req('总产量'), consumed: req('农民自身消耗') },
    unit: '',
    desc: '剩余率决定能养多少工匠/士兵/祭司。这是城市化的基本原理。',
    keys: ['surplus', '剩余', '城市化'],
  },
  {
    id: 'population_density_limit',
    cat: 'perception/agriculture',
    name: '土地承载力',
    expr: 'area * yield_per_m2 / (kcal_per_day * 365)',
    params: { area: req('面积 m²'), yield_per_m2: req('每平方米年产 kg'), kcal_per_day: p(2200, '人均日热量') },
    unit: '人',
    desc: '一块地最多养活多少人。',
    keys: ['carrying capacity', '承载力'],
  },
  {
    id: 'irrigation_water_need',
    cat: 'perception/agriculture',
    name: '灌溉需水量',
    expr: 'area * depth',
    params: { area: req('灌溉面积 m²'), depth: req('灌溉深度 m（水稻约 0.1）') },
    unit: 'm³',
    desc: '农业用水。河流改道、水利工程的动机。',
    keys: ['irrigation', '灌溉', '水利'],
  },
  {
    id: 'river_discharge',
    cat: 'perception/agriculture',
    name: '河流流量',
    expr: 'width * depth * velocity',
    params: { width: req('河宽 m'), depth: req('水深 m'), velocity: req('流速 m/s') },
    unit: 'm³/s',
    desc: '河有多大。航运能力、渡河难度、洪水规模。',
    keys: ['river', '河流', '流量'],
  },
  {
    id: 'river_crossing_time',
    cat: 'perception/travel',
    name: '渡河耗时',
    expr: 'width / boat_speed',
    params: { width: req('河宽 m'), boat_speed: p(1, '船速 m/s') },
    unit: 's',
    desc: '渡河要多久。军事行动的窗口期。',
    keys: ['crossing', '渡河'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 六、建筑与工程（读者眼中的城市）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'building_height_limit',
    cat: 'perception/architecture',
    name: '建筑高度上限（材料强度）',
    expr: 'strength / (rho * g)',
    params: { strength: req('材料抗压强度 Pa'), rho: req('材料密度 kg/m³'), g: p(9.80665, '重力加速度') },
    unit: 'm',
    desc: '材料能撑起的最大高度（等截面）。花岗岩约 2km，钢约 30km。高重力世界建筑更矮。',
    keys: ['building height', '建筑高度', '摩天楼'],
  },
  {
    id: 'tower_footprint',
    cat: 'perception/architecture',
    name: '高塔底部所需占地面积',
    expr: 'W / (sigma_allow * 0.5)',
    params: { W: req('总重量 N'), sigma_allow: req('容许应力 Pa') },
    unit: 'm²',
    desc: '塔越高底部越粗。粗野主义巨构的城市轮廓依据。',
    keys: ['tower', '高塔', '占地'],
  },
  {
    id: 'wall_thickness',
    cat: 'perception/architecture',
    name: '城墙厚度（抗冲击）',
    expr: 'F / (sigma * h)',
    params: { F: req('冲击力 N'), sigma: req('材料强度 Pa'), h: req('墙高 m') },
    unit: 'm',
    desc: '城墙要多厚才能挡得住攻城锤。',
    keys: ['wall', '城墙'],
  },
  {
    id: 'city_population_area',
    cat: 'perception/architecture',
    name: '城市人口与面积',
    expr: 'population * area_per_person',
    params: { population: req('人口'), area_per_person: p(200, '人均占地 m²（古代城市约 100-300）') },
    unit: 'm²',
    desc: '城市铺多大。城墙周长、街市规模的估算。',
    keys: ['city area', '城市面积'],
  },
  {
    id: 'city_wall_perimeter',
    cat: 'perception/architecture',
    name: '城墙周长（圆形城市）',
    expr: '2 * pi * sqrt(area / pi)',
    params: { area: req('城市面积 m²') },
    unit: 'm',
    desc: '围一圈城墙要修多长。防御成本。',
    keys: ['city wall', '城墙周长'],
  },
  {
    id: 'beacon_chain',
    cat: 'perception/architecture',
    name: '烽火传递时间',
    expr: '(distance / spacing) * relay_time',
    params: { distance: req('总距离 m'), spacing: req('烽火台间距 m'), relay_time: p(60, '每站响应秒数') },
    unit: 's',
    desc: '消息传递多快。信息传播速度决定政治版图大小——这是历史铁律。',
    keys: ['beacon', '烽火', '消息传递'],
  },
  {
    id: 'messenger_network_time',
    cat: 'perception/architecture',
    name: '驿站传信时间',
    expr: 'distance / (speed * 3600) + stops * rest_hours',
    params: { distance: req('距离 km'), speed: p(15, '马速 km/h'), stops: req('换马次数'), rest_hours: p(0.2, '每次换马耗时 小时') },
    unit: '小时',
    desc: '帝国通信的实际延迟。版图上限由此决定。',
    keys: ['messenger', '驿站', '通信'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 七、气候与天气（读者感受到的环境）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'wind_power',
    cat: 'perception/climate',
    name: '风功率密度',
    expr: '0.5 * rho * A * v^3',
    params: { rho: p(1.225, '空气密度 kg/m³'), A: req('迎风面积 m²'), v: req('风速 m/s') },
    unit: 'W',
    desc: '风力随速度三次方增长。风帆、风车、风暴破坏力。',
    keys: ['wind power', '风力'],
  },
  {
    id: 'rainfall_runoff',
    cat: 'perception/climate',
    name: '降水径流总量',
    expr: 'catchment * rainfall * runoff_coefficient',
    params: { catchment: req('流域面积 m²'), rainfall: req('降水量 m/年'), runoff_coefficient: p(0.4, '径流系数 0-1') },
    unit: 'm³',
    desc: '一条河的年流量来源。绿洲/荒漠分界的定量判断。',
    keys: ['rainfall', '降水', '径流'],
  },
  {
    id: 'evaporation_rate',
    cat: 'perception/climate',
    name: '蒸发速率（简化）',
    expr: 'k * (es - ea)',
    params: { k: req('传质系数'), es: req('饱和水汽压 Pa'), ea: req('实际水汽压 Pa') },
    unit: 'kg/(m²·s)',
    desc: '干旱程度的物理基础。',
    keys: ['evaporation', '蒸发'],
  },
  {
    id: 'lapse_rate_temp',
    cat: 'perception/climate',
    name: '海拔降温',
    expr: 'T0 - lapse * h',
    params: { T0: req('海平面温度 K'), lapse: p(0.0065, '递减率 K/m'), h: req('海拔 m') },
    unit: 'K',
    desc: '每升高 1km 降约 6.5℃。雪线、高山苔原的依据。',
    keys: ['lapse rate', '降温', '雪线'],
  },
  {
    id: 'snow_line',
    cat: 'perception/climate',
    name: '雪线高度',
    expr: '(T_summer - 273.15) / lapse',
    params: { T_summer: req('夏季海平面温度 K'), lapse: p(0.0065, '递减率 K/m') },
    unit: 'm',
    desc: '常年积雪的起始高度。山脉的巨大感来源。',
    keys: ['snow line', '雪线'],
  },

  // ══════════════════════════════════════════════════════════════════
  // 八、火与能量（技术文明的可见标志）
  // ══════════════════════════════════════════════════════════════════
  {
    id: 'combustion_energy',
    cat: 'perception/technology',
    name: '燃料燃烧热量',
    expr: 'mass * energy_density',
    params: { mass: req('燃料质量 kg'), energy_density: req('能量密度 J/kg（木材 1.6e7，煤 2.4e7，油 4.4e7）') },
    unit: 'J',
    desc: '燃料决定文明能做什么。木材 vs 煤 vs 油的代差。',
    keys: ['combustion', '燃烧', '燃料'],
  },
  {
    id: 'smelting_temperature',
    cat: 'perception/technology',
    name: '熔炼所需能量',
    expr: 'mass * (cp * (T_melt - T0) + latent)',
    params: { mass: req('质量 kg'), cp: req('比热 J/(kg·K)'), T_melt: req('熔点 K'), T0: p(293, '环境温度 K'), latent: req('熔化潜热 J/kg') },
    unit: 'J',
    desc: '炼铁/炼铜的能量门槛。这决定了技术树能走到哪一步。',
    keys: ['smelting', '熔炼', '冶金'],
  },
  {
    id: 'energy_per_capita',
    cat: 'perception/technology',
    name: '人均能量消耗',
    expr: 'total_energy / population',
    params: { total_energy: req('总能耗 J/年'), population: req('人口') },
    unit: 'J/人·年',
    desc: '文明的能量级别。采集社会约 1e10，工业社会约 1e12。',
    keys: ['energy per capita', '人均能耗'],
  },
  {
    id: 'carrying_kcal_per_hectare',
    cat: 'perception/technology',
    name: '耕地能量产出密度',
    expr: 'kg_per_hectare * kcal_per_kg * 4184 / 1e4',
    params: { kg_per_hectare: req('每公顷产量 kg'), kcal_per_kg: p(3500, '每公斤热量 kcal') },
    unit: 'J/m²·年',
    desc: '一平方米土地每年产出多少能量。对比人均能耗就知道能养多少人。',
    keys: ['yield energy', '能量产出'],
  },
]
