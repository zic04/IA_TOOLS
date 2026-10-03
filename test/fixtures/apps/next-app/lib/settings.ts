// Fixture: a Node destructuring read of process.env, for the `env` facts source.
const { FEATURE_FLAG, ANALYTICS_KEY: analyticsKey } = process.env;

export function flags() {
  return { enabled: FEATURE_FLAG === "1", analyticsKey };
}
