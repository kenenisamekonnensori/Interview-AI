/**
 * Provider adapters can expose only these application-defined tools. Tool
 * handlers are supplied by domain services; adapters never receive a database
 * client or permission context.
 */
export type AiToolDefinition<Input, Output> = {
  name: string;
  validateInput: (value: unknown) => Input;
  execute: (input: Input) => Promise<Output>;
};

export class AiToolBridge {
  constructor(private readonly tools: ReadonlyMap<string, AiToolDefinition<unknown, unknown>>) {}

  async execute(name: string, input: unknown) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error("Requested AI tool is not allowed.");
    return tool.execute(tool.validateInput(input));
  }
}
