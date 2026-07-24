/**
 * Façade Kinematics — a pure, dependency-free geometry engine.
 *
 *   Solar Position → SolarVector → FacadeSurface → PanelKinematics → RotationSolver
 *                                                                        │
 *                                              (PBIF later chooses the intent) ─┘
 *
 * The whole package answers ONE question with vectors only: given where the sun
 * is and how a panel is mounted, what rotation does the geometry call for? It has
 * no decision engine, no weather, no optimisation — future PBIF simply calls
 * `solve()` and picks an intent.
 */
export * from './vectorMath'
export * from './solarVector'
export * from './facadeSurface'
export * from './incidentAngle'
export { PanelKinematics } from './panelKinematics'
export {
  solve,
  solveForNormal,
  evaluateCandidates,
  alignAngle,
  surfaceFromNormal,
  RECOMMENDED_INTENT,
  REST_ANGLE,
  type Intent,
  type StrategyKey,
  type CandidateStrategy,
  type RotationSolution,
} from './rotationSolver'
