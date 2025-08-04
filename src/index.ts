import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Replicate from "replicate";

interface Env {
  E2B_API_KEY: string;
  REPLICATE_API_TOKEN?: string;
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
}

// Extract Bearer token from Authorization header
function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return null;
  }
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// Create unauthorized response
function createUnauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized", message: "Valid Bearer token required" }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": "Bearer",
      },
    }
  );
}

export class MyMCP extends McpAgent<Env> {
  server = new McpServer({ 
    name: "Remote MCP Server", 
    version: "1.0.0",
    description: "Remote MCP server with Recraft V3 SVG generation"
  });
  
	async init() {
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

		// Recraft SVG generation tool
		this.server.tool(
			"generate_svg",
			{
				prompt: z.string().min(1, "Prompt is required"),
				aspect_ratio: z.enum([
					"Not set", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", 
					"1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"
				]).optional().default("Not set"),
				size: z.enum([
					"1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536",
					"1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024",
					"1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"
				]).optional().default("1024x1024"),
				style: z.enum([
					"any", "engraving", "line_art", "line_circuit", "linocut"
				]).optional(),
			},
			async ({ prompt, aspect_ratio, size, style }) => {
				// Access the API key from the current environment
				const apiKey = this.env.REPLICATE_API_TOKEN;
				
				if (!apiKey) {
					return {
						content: [
							{
								type: "text",
								text: "Error: Replicate API key not available. Please provide a valid Bearer token in the Authorization header."
							}
						],
					};
				}

				try {
					const replicate = new Replicate({
						auth: apiKey,
					});

					const input: any = {
						prompt,
						size,
						aspect_ratio,
					};

					if (style) {
						input.style = style;
					}

					const output = await replicate.run("recraft-ai/recraft-v3-svg", { input });

					return {
						content: [
							{
								type: "text",
								text: `SVG generated successfully! URL: ${output}`
							}
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error generating SVG: ${error instanceof Error ? error.message : String(error)}`
							}
						],
					};
				}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Extract Bearer token from Authorization header
		const token = extractBearerToken(request);
		
		// For MCP endpoints, validate authorization
		if (url.pathname === "/sse" || url.pathname === "/sse/message" || url.pathname === "/mcp") {
			if (!token) {
				return createUnauthorizedResponse();
			}
			
			// Create enhanced environment with API key from token
			const enhancedEnv: Env = {
				...env,
				REPLICATE_API_TOKEN: token, // Use the authorization token as the API key
			};
			
			if (url.pathname === "/sse" || url.pathname === "/sse/message") {
				return MyMCP.serveSSE("/sse").fetch(request, enhancedEnv, ctx);
			}

			if (url.pathname === "/mcp") {
				return MyMCP.serve("/mcp").fetch(request, enhancedEnv, ctx);
			}
		}

		return new Response("Not found", { status: 404 });
	},
};
