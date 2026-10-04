/** Split JVM arguments without invoking a shell; quoted Windows paths remain intact. */
export function parseJvmArguments(input: string): string[] {
  const argumentsList: string[] = [];
  let current = '';
  let quote = '';
  let started = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '\\' && quote && input[index + 1] === quote) { current += input[++index]; started = true; }
    else if (char === quote) quote = '';
    else if (!quote && (char === '"' || char === "'")) { quote = char; started = true; }
    else if (!quote && /\s/.test(char)) {
      if (started) { argumentsList.push(current); current = ''; started = false; }
    } else { current += char; started = true; }
  }
  if (quote) throw new Error('Un guillemet n’est pas fermé dans les arguments JVM.');
  if (started) argumentsList.push(current);
  return argumentsList;
}
