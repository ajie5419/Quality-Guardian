import Compressor from 'compressorjs';

export type CompressPreset = 'evidence' | 'lossy';

interface CompressOptions {
  maxHeight: number;
  maxSizeMB: number;
  maxWidth: number;
  quality: number;
}

const PRESETS: Record<CompressPreset, CompressOptions> = {
  evidence: {
    maxHeight: 2560,
    maxSizeMB: 3,
    maxWidth: 2560,
    quality: 1,
  },
  lossy: {
    maxHeight: 1920,
    maxSizeMB: 0.5,
    maxWidth: 1920,
    quality: 0.7,
  },
};

const COMPRESSIBLE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export function useImageCompress() {
  function isImage(file: File): boolean {
    return COMPRESSIBLE_IMAGE_TYPES.has(file.type.toLowerCase());
  }

  function compressImage(
    file: File,
    preset: CompressPreset = 'lossy',
  ): Promise<File> {
    if (!isImage(file)) return Promise.resolve(file);

    const opts = PRESETS[preset];
    if (file.size <= opts.maxSizeMB * 1024 * 1024) {
      return Promise.resolve(file);
    }

    return new Promise((resolve, reject) => {
      const compressor = new Compressor(file, {
        maxHeight: opts.maxHeight,
        maxWidth: opts.maxWidth,
        quality: opts.quality,
        error: reject,
        success(result) {
          resolve(
            new File([result], file.name, {
              lastModified: file.lastModified,
              type: result.type || file.type,
            }),
          );
        },
      });
      void compressor;
    });
  }

  return { compressImage, isImage };
}
