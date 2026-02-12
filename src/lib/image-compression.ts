const MAX_WIDTH = 1280;
const QUALITY = 0.75;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function compressImage(file: File): Promise<CompressionResult> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Arquivo muito grande (${formatFileSize(file.size)}). Limite: ${formatFileSize(MAX_FILE_SIZE)}`);
  }

  // If not an image, return as-is
  if (!file.type.startsWith('image/')) {
    return { file, originalSize: file.size, compressedSize: file.size };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Only resize if wider than MAX_WIDTH
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ file, originalSize: file.size, compressedSize: file.size });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Output as JPEG for better compression (unless it's a PNG with transparency needs)
      const outputType = 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ file, originalSize: file.size, compressedSize: file.size });
            return;
          }

          // If compressed is larger, use original
          if (blob.size >= file.size) {
            resolve({ file, originalSize: file.size, compressedSize: file.size });
            return;
          }

          const compressedFile = new File(
            [blob],
            file.name.replace(/\.\w+$/, '.jpg'),
            { type: outputType }
          );
          resolve({
            file: compressedFile,
            originalSize: file.size,
            compressedSize: compressedFile.size,
          });
        },
        outputType,
        QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar imagem para compressão'));
    };

    img.src = url;
  });
}
