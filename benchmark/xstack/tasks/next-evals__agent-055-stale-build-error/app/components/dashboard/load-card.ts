export async function loadSummaryCard() {
  const { SummaryCard } = await import('./summary-card')
  return { default: SummaryCard }
}
