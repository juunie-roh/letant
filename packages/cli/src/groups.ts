const option = {} as const;

const command = {
  dev: "Development Commands",
} as const;

export const group = { command, option } as const;
