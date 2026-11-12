/** Save `data` as a file through the browser's download. */
export function download(filename: string, data: BlobPart, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Safari can ask before it saves: the file must still be there when the user answers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
