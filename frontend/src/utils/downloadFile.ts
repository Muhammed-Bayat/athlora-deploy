export function downloadFile(content: BlobPart | Uint8Array, name: string, type: string): void {
  const blobContent: BlobPart = content instanceof Uint8Array
    ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
    : content;
  const url = URL.createObjectURL(new Blob([blobContent], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
