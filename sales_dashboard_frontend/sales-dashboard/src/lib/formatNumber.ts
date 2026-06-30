export function formatNumber(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return "0"

  const abs = Math.abs(value)

  if (abs >= 1000000) {
    return (value / 1000000).toFixed(2) + "M MT"
  } else if (abs >= 1000) {
    return (value / 1000).toFixed(2) + "K MT"
  } else {
    return value.toLocaleString() + " MT"
  }
}
