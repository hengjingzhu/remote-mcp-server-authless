import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Sandbox } from '@e2b/code-interpreter';

interface Env {
  E2B_API_KEY: string;
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
}

export class MyMCP extends McpAgent<Env> {
  server = new McpServer({ 
    name: "E2B Code Interpreter", 
    version: "1.0.0",
    description: "Run code in secure E2B sandboxes"
  });

  private sandboxes: Map<string, Sandbox> = new Map();

	async init() {

		// 定义 runCode 工具
		this.server.tool(
		"runCode",
		{
			description: "Execute code in a secure E2B sandbox",
			parameters: z.object({
			code: z.string().describe("The code to execute"),
			language: z.enum(["python", "javascript", "typescript"]).default("python").describe("Programming language"),
			sandboxId: z.string().optional().describe("Existing sandbox ID to reuse")
			})
		},
		async ({ code, language, sandboxId }) => {
			try {
			let sandbox: Sandbox;
			
			// 复用现有沙箱或创建新沙箱
			if (sandboxId && this.sandboxes.has(sandboxId)) {
				sandbox = this.sandboxes.get(sandboxId)!;
			} else {
				// 根据语言创建相应的沙箱
				const template = language === "python" ? "base" : "nodejs";
				sandbox = await Sandbox.create({
				apiKey: this.env.E2B_API_KEY,
				template
				});
				
				// 生成新的沙箱ID
				const newSandboxId = crypto.randomUUID();
				this.sandboxes.set(newSandboxId, sandbox);
				
				// 设置沙箱ID用于返回
				sandboxId = newSandboxId;
			}

			// 执行代码
			const execution = await sandbox.runCode(code);
			
			return {
				content: [{
				type: "text",
				text: JSON.stringify({
					success: true,
					sandboxId,
					output: execution.text,
					results: execution.results,
					logs: execution.logs,
					error: execution.error
				}, null, 2)
				}]
			};
			} catch (error: any) {
			return {
				content: [{
				type: "text",
				text: JSON.stringify({
					success: false,
					error: error.message || "Failed to execute code"
				}, null, 2)
				}]
			};
			}
		}
		);

		// 定义 createSandbox 工具
    this.server.tool(
      "createSandbox",
      {
        description: "Create a new E2B sandbox for code execution",
        parameters: z.object({
          template: z.string().default("base").describe("Sandbox template (base, nodejs, etc.)"),
          timeout: z.number().optional().describe("Sandbox timeout in seconds")
        })
      },
      async ({ template, timeout }) => {
        try {
          const sandbox = await Sandbox.create({
            apiKey: this.env.E2B_API_KEY,
            template,
            timeout
          });
          
          const sandboxId = crypto.randomUUID();
          this.sandboxes.set(sandboxId, sandbox);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                sandboxId,
                message: "Sandbox created successfully"
              }, null, 2)
            }]
          };
        } catch (error: any) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error.message || "Failed to create sandbox"
              }, null, 2)
            }]
          };
        }
      }
    );

    // 定义 closeSandbox 工具
    this.server.tool(
      "closeSandbox",
      {
        description: "Close an existing E2B sandbox",
        parameters: z.object({
          sandboxId: z.string().describe("The sandbox ID to close")
        })
      },
      async ({ sandboxId }) => {
        try {
          if (!this.sandboxes.has(sandboxId)) {
            throw new Error("Sandbox not found");
          }
          
          const sandbox = this.sandboxes.get(sandboxId)!;
          await sandbox.close();
          this.sandboxes.delete(sandboxId);
          
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "Sandbox closed successfully"
              }, null, 2)
            }]
          };
        } catch (error: any) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error.message || "Failed to close sandbox"
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
