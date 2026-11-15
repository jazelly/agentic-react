export function defineStaticParams<Key extends string>(
  key: Key,
  values: string[]
) {
  return (_route: string) => values.map((value) => ({ [key]: value }))
}
