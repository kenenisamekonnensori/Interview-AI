/** Pure helper so the greeting logic is testable; the Overview page supplies the local hour. */
export function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}
