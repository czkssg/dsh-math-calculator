/**
 * 单位量纲抽查：拿已知常识值反算，看结果是否合理。
 * 这是防止「公式能算但算错」的关键 —— 光有 270/270 可求值是不够的。
 */
const mod = await import('../lib/index.js')
const q = (f, o) => {
  const r = mod.runMathTool({ operation: 'formula', formula: f, overrides: o })
  return r.ok ? Number(r.value?.answer) : NaN
}

let pass = 0
const fails = []
const check = (name, actual, expected, relTol) => {
  const err = Math.abs(actual - expected) / Math.abs(expected)
  if (err <= relTol) {
    pass++
    console.log(`  ok   ${name}: ${actual.toPrecision(4)} (期望 ${expected.toPrecision(4)})`)
  } else {
    fails.push({ name, actual, expected, err })
    console.log(`  FAIL ${name}: 实际 ${actual} ≠ 期望 ${expected}（偏差 ${(err * 100).toFixed(1)}%）`)
  }
}

console.log('— 常识值反算 —')

// 地球视距：眼高 1.7m → 约 4.66 km
check('地球视距(1.7m)', q('horizon_distance', { R: 6371000, h: 1.7 }), 4657, 0.01)

// 地球一天：ω=7.292e-5 → 86164s
check('地球自转一天', q('day_length', { omega: 7.292e-5 }), 86164, 0.001)

// 地球引力：g=GM/R² ≈ 9.82
check('地球表面重力', q('surface_gravity', { M: 5.9722e24, R: 6371000 }), 9.82, 0.01)

// 地球逃逸速度 ≈ 11186 m/s
check('地球逃逸速度', q('escape_velocity', { M: 5.9722e24, r: 6371000 }), 11186, 0.01)

// 地月视直径 ≈ 0.00904 rad（约 0.52°）
check('月亮视直径', q('apparent_size', { r: 1737400, d: 3.844e8 }), 0.00904, 0.01)

// 10 万人城市占地 200 m²/人 = 2e7 m² = 20 km²
check('10万人城市占地', q('city_population_area', { population: 100000, area_per_person: 200 }), 2e7, 0.01)

// 耕地：10万人需要约 115 km²（手算 1.147e8 m²）
check('10万人耕地', q('crop_yield_area', { people: 100000, yield_per_m2: 0.2, kcal_per_kg: 3500 }), 1.147e8, 0.02)

// 声速 20℃ 约 343 m/s
check('声速(293K)', q('sound_speed_air', { T: 293.15 }), 343, 0.01)

// 花岗岩建筑高度上限 ≈ 1.3e8/(2700×9.8) ≈ 4900 m
check('花岗岩高度上限', q('building_height_limit', { strength: 1.3e8, rho: 2700, g: 9.80665 }), 4914, 0.02)

// 1 kg 质能 ≈ 8.99e16 J
check('1kg 质能', q('mass_energy', { m: 1 }), 8.9875e16, 0.01)

// 地球昼夜平分时昼长应约 12 小时
check('赤道春分昼长', q('solar_day_length', { latitude: 0, declination: 0 }), 12, 0.01)

// 极地极昼应返回 24
check('北极夏至极昼', q('solar_day_length', { latitude: 1.5, declination: 0.409 }), 24, 0.01)

// 1 摩尔气体 300K 101325Pa ≈ 0.0246 m³
check('理想气体摩尔体积', q('ideal_gas', { n: 1, T: 300, P: 101325 }), 0.0246, 0.01)

// 太阳光度应该对得上：4πR²σT⁴，R=6.957e8, T=5778 → 3.83e26 W
check('太阳光度', q('stellar_luminosity', { R: 6.957e8, T: 5778 }), 3.83e26, 0.02)

// 史瓦西半径：太阳质量 → 约 2953 m
check('太阳史瓦西半径', q('schwarzschild_radius', { M: 1.989e30 }), 2953, 0.01)

console.log('')
console.log(`通过 ${pass}，失败 ${fails.length}`)
if (fails.length > 0) process.exitCode = 1
