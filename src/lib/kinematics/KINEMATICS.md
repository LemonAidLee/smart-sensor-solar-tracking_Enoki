# Façade Kinematic Model — Sun → Panel Rotation

A **pure geometry engine** ([`src/lib/kinematics/`](.)) that maps the current
solar position to a panel rotation using vectors only — no AI, no weather, no
optimisation, no time-of-day rules. It is the permanent physical foundation the
PBIF decision layer, optimisation and embedded control will sit on top of.

```
Solar Position → SolarVector → FacadeSurface → PanelKinematics → RotationSolver
                                                                      │
                                            (PBIF later chooses the intent) ┘
```

## 1. Mathematical formulation

A vertical blade rotates about its own vertical axis, so its outward normal sweeps
a horizontal circle. Everything follows from that one fact.

| Quantity | Definition |
|---|---|
| Sun vector | `ŝ = (sin az·cos alt, sin alt, −cos az·cos alt)` (toward sun) |
| Sun azimuthal dir | `ŝₕ = normalize(ŝ.x, 0, ŝ.z)` |
| Panel normal | `n̂(θ) = rotateY(nₛ, −θ)` — sweeps the horizontal circle |
| Beam interception (exposure) | `E(θ) = \|n̂(θ)·ŝ\|` ∈ [0,1] |
| Beam incidence on plane | `i(θ) = acos\|n̂(θ)·ŝ\|` ∈ [0°,90°] |
| Façade lit? | `nₛ·ŝ > 0` (single-sided window) |

The blade is a **flat, double-sided plate**, so interception uses the **absolute**
cosine `|n̂·ŝ|` — it shades identically whichever face points at the sun. (Using
`max(0,·)` is a real bug: it reports zero shading whenever the back face leads.)

## 2. Coordinate system

Right-handed world frame **+X = East, +Y = Up, +Z = South** (⇒ North = −Z,
West = −X), identical to the twin's `compassToWorld`, so the kinematics agree
with the rendered sun and building exactly. The `−θ` sign in `n̂(θ)` matches the
renderer's `−Y` hinge (`FacadeLayer.tsx`), so the solved angle *is* what is drawn.

## 3–5. Solar vector · façade frame · incident angle

- `SolarVector` (§3): builds `ŝ`, its horizontal projection and the incident ray.
- `FacadeSurface` (§4): `{ normal, rotationAxis = +Y, right = +Y×n, up = +Y }` —
  a full local basis from one normal; works for **any** orientation (no E/W
  assumption).
- `IncidentAngle` (§5): `projectedExposure = |n̂·ŝ|`, `beamIncidenceDeg`,
  and the signed `cosIncidence` for the fixed façade.

## 6–8. Candidate strategies, comparison, chosen strategy

Solved analytically from the `rotateY` bearing identity
(`bearing(n̂(θ)) = bearing(nₛ) − θ`): the alignment angle is
**θ\* = bearing(nₛ) − bearing(ŝₕ)** (no search).

| # | Strategy | Result | Reduces to |
|---|---|---|---|
| A | Panel normal ∥ solar projection | θ\* | **track sun** |
| B | Panel ⟂ sunlight | θ\* (azimuth-limited) | **track sun** |
| C | Maximum shading | θ\* | **track sun** |
| E | Minimum incident angle | θ\* | **track sun** |
| D | Minimum projected exposure | θ\* ± 90° | **edge-on** |

**Comparison.** Because a vertical-axis blade only steers in *azimuth*, it cannot
tilt to the sun's altitude — so A, B, C and E are mathematically the **same
rotation**: point the normal at the sun's azimuth. That maximises interception to
the ceiling `E = cos(alt)`; the residual incident angle equals the solar altitude.
D is the orthogonal complement (edge-on, `E → 0`, maximum daylight).

**Chosen (default): C ≡ A ≡ B ≡ E — "shade" intent.** A kinetic shading façade
that turns to face the sun is the motion that reads as physically *responding to
the real sun*, and it is the unique family that maximises direct-beam interception
/ minimises incident angle. `daylight` (D) is offered as its complement. The
solver returns **both**; choosing between them is the only thing PBIF must later
do — it never touches the trigonometry.

When a façade is **back-lit** (`nₛ·ŝ ≤ 0`) or the **sun is down**, there is no beam
to respond to, so the blade rests **edge-on/open** (θ = 90°). Near the **zenith**
(`cos alt ≈ 0`) azimuth control is meaningless, so it holds — avoiding jitter.

## 9–10. Solver & continuous 360° logic

A flat blade is symmetric: `θ` and `θ+180°` are the **same plane** with identical
shading. Every target is therefore a family `{θ* + 180°·k}`; the solver commands
the member **nearest the current angle** (`nearestCongruent`, period 180°),
returned as a **continuous** value. Consequences:

- shortest path is always **≤ 90°**, never a 359°→0° jump, never a needless reversal;
- the panel exploits its full continuous 360° freedom instead of unwinding.

## 11. Daily validation — Kuala Lumpur (3.14°N, 101.69°E), 2026-07-21, "shade"

Target angle ° / interception `E` (`—` = rest, back-lit). Exposure at track equals
**cos(altitude)** to 2 dp — the proven ceiling.

| Local | Sun alt/az | East | South | West | North |
|------:|:----------:|:----:|:-----:|:----:|:-----:|
| 07:00 | −3° / 69° | — | — | — | — (pre-sunrise) |
| 09:00 | 25° / 69° | **159°/0.91** | — | — | **69°/0.91** |
| 11:00 | 52° / 60° | **150°/0.62** | — | — | **60°/0.62** |
| 13:00 | 72° / 15° | 105°/0.31 | — | — | **15°/0.31** |
| 15:00 | 60° / 307° | — | — | **37°/0.50** | **307°/0.50** |
| 17:00 | 34° / 293° | — | — | **23°/0.83** | **293°/0.83** |
| 19:00 | 6° / 290° | — | — | **20°/0.99** | **290°/0.99** |

The lit façades hand off **East/North → West/North** as the sun crosses; the North
façade participates because Malaysia's mid-year sun sits north at noon (§ solar
model). No time rule produces this — it is entirely `n̂·ŝ`. Target angles vary
**continuously** (159→150→105) — smooth, shortest-path motion.

## 12. Debug / engineering visualisation

- `KinematicsInspector` (DOM): for a selected surface — solar vector, panel normal,
  incident angle, projected exposure vs the `cos(alt)` ceiling, the commanded
  rotation and a plain-language **reason**, plus the A–E candidate comparison with
  their equivalences. Explains *why* the panel rotated.
- `KinematicsDebug` (3D): draws the solar vector, surface normal, live panel
  normal, vertical rotation axis and the projected-shadow direction on the
  selected surface.

## 13. Performance

Everything is **closed-form O(surfaces)** per frame — one `atan2` and a handful of
dot products per surface; **no iteration, no search, no per-blade solve** (co-planar
panels share a surface solution). Vector maths is allocation-light and dependency-
free, so it runs identically in the browser, in a Node study, or (later) on the
embedded controller.

## 14. Why this is physically correct

Every rotation is a direct consequence of the incident solar vector and the
surface geometry — `n̂·ŝ` and one alignment angle — with the blade's flat-plate
symmetry and continuous rotation handled exactly. There are no heuristics or
time-based curves to be "correct" about: the façade tracks the true sun because
the maths *is* the physics. This is why it is a sound foundation — PBIF changes
*which* physically-valid orientation is chosen (shade / daylight / glare / energy),
never *how* the geometry is computed.

## References for the coordinate/vector conventions
Solar vector convention matches the twin's NOAA model (`SOLAR_MODEL.md`). Standard
rotation/optics identities; no external data or fitted curves are used here.
