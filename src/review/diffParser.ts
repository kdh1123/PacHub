export interface AddedDiffLine {
  line: number;
  content: string;
}

export function parseAddedLines(patch: string | undefined): AddedDiffLine[] {
  if (!patch) return [];
  const added: AddedDiffLine[] = [];
  let newLine = 0;

  for (const line of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      added.push({ line: newLine, content: line.slice(1) });
      newLine += 1;
    } else if (!line.startsWith('-') && !line.startsWith('\\')) {
      newLine += 1;
    }
  }

  return added;
}
