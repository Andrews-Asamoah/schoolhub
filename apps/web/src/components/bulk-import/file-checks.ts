export interface FileRules {
  extensions?: readonly string[];
  mimeTypes?: readonly string[];
  multiple?: boolean;
  maxFiles?: number;
  maxBytes?: number;
}

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

const megabytes = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

/** Returns why a drop or selection must be refused, or null when every file is acceptable. */
export function checkFiles(
  files: readonly Pick<File, "name" | "size" | "type">[],
  { extensions = [], mimeTypes = [], multiple = false, maxFiles, maxBytes }: FileRules,
): string | null {
  if (!multiple && files.length > 1) return "Choose one file at a time.";
  if (maxFiles && files.length > maxFiles) return `Choose no more than ${maxFiles} files at a time.`;
  for (const file of files) {
    const restricted = extensions.length > 0 || mimeTypes.length > 0;
    if (restricted && !extensions.includes(extensionOf(file.name)) && !mimeTypes.includes(file.type)) {
      const allowed = [...extensions, ...mimeTypes.map((type) => type.replace(/^.*\//, "").toUpperCase())].join(", ");
      return `${file.name}: this file type is not supported. Use ${allowed}.`;
    }
    if (maxBytes && file.size > maxBytes) return `${file.name} is larger than ${megabytes(maxBytes)}.`;
  }
  return null;
}
