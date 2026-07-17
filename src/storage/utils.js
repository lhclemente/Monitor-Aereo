export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function boolToInt(value) {
  return value ? 1 : 0;
}

export function intToBool(value) {
  return Number(value) === 1;
}
