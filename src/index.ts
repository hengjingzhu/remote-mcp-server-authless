import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Sandbox } from '@e2b/code-interpreter';

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	async init() {

		// 快速执行代码
    this.server.tool(
      "run_code",
      {
        description: "Execute code in a temporary E2B sandbox",
        parameters: z.object({
          language: z.enum(["python", "javascript", "typescript", "bash"])
            .describe("Programming language to execute"),
          code: z.string().describe("Code to execute"),
          timeout: z.number().optional().default(30000)
            .describe("Execution timeout in milliseconds")
        })
      },
      async ({ language, code, timeout }) => {
        try {
          // 设置 E2B API Key
        //   process.env.E2B_API_KEY = this.props.env.E2B_API_KEY;

          // 创建沙箱
          const sandbox = await Sandbox.create({
            template: language === 'javascript' || language === 'typescript' ? 'nodejs' : language
          });

          try {
            // 执行代码
            const execution = "111"          
            // 关闭沙箱
            await sandbox.close();

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                //   success: !execution.error,
                //   output: execution.text,
                //   error: execution.error,
                //   logs: execution.logs,
                //   results: execution.results
                }, null, 2)
              }]
            };
          } catch (error) {
            await sandbox.close();
            throw error;
          }
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                // error: error.message
              }, null, 2)
            }]
          };
        }
      }
    );

		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
