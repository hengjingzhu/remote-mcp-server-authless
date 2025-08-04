import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Replicate from "replicate";

interface Env {
  E2B_API_KEY: string;
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
  MCP_OBJECT: DurableObjectNamespace;
}

// Extract Bearer token from Authorization header
function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return null;
  }
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  console.log("match",match)
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

  private currentBearerToken?: string;

  // Override fetch to handle internal Bearer token storage requests
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle internal Bearer token storage request
    if (url.pathname === "/store-bearer-token" && request.method === "POST") {
      try {
        const { token } = await request.json() as { token: string };
        console.log("Durable Object - Storing Bearer token:", token ? "[present]" : "[missing]");
        
        // Store the Bearer token in Durable Object persistent storage
        await this.ctx.storage.put("bearerToken", token);
        console.log("Durable Object - Bearer token stored in persistent storage");
        
        return new Response("Token stored", { status: 200 });
      } catch (error) {
        console.error("Durable Object - Failed to store Bearer token:", error);
        return new Response("Failed to store token", { status: 500 });
      }
    }
    
    // Call parent fetch method for all other requests
    return super.fetch(request);
  }
  
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
				// Retrieve Bearer token from storage if not already cached
				if (!this.currentBearerToken) {
					try {
						console.log("Tool execution - Retrieving Bearer token from storage");
						this.currentBearerToken = await this.ctx.storage.get("bearerToken") as string;
						console.log("Tool execution - Bearer token retrieved from storage:", this.currentBearerToken ? "[present]" : "[missing]");
					} catch (error) {
						console.error("Tool execution - Failed to retrieve Bearer token:", error);
					}
				} else {
					console.log("Tool execution - Using cached Bearer token");
				}
				
				console.log("Tool execution - Final Bearer token status:", this.currentBearerToken ? "[present]" : "[missing]");
				console.log("Tool execution - Bearer token value:", this.currentBearerToken ? this.currentBearerToken.substring(0, 10) + "..." : "undefined");
				
				const apiKey = this.currentBearerToken;
				
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

// Helper function to store Bearer token in Durable Object storage
async function storeBearerTokenInDO(env: Env, sessionId: string, token: string, endpointType: "sse" | "mcp"): Promise<void> {
	// Get the correct Durable Object instance that the MCP SDK will use
	// Based on MCP SDK source: SSE uses "sse:${sessionId}", direct MCP uses "streamable-http:${sessionId}"
	const doPrefix = endpointType === "sse" ? "sse" : "streamable-http";
	const id = env.MCP_OBJECT.idFromName(`${doPrefix}:${sessionId}`);
	const doStub = env.MCP_OBJECT.get(id);
	
	// Store the Bearer token in Durable Object storage
	// We'll use a special internal endpoint to store the token
	await doStub.fetch(new Request("https://internal/store-bearer-token", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ token })
	}));
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Extract Bearer token from Authorization header
		const token = extractBearerToken(request);
		console.log("Worker fetch - URL:", url.pathname);
		console.log("Worker fetch - Bearer token:", token ? "[present]" : "[missing]");
		
		// For MCP endpoints, validate authorization
		if (url.pathname === "/sse" || url.pathname === "/sse/message" || url.pathname === "/mcp") {
			if (!token) {
				return createUnauthorizedResponse();
			}
			
			console.log("Worker fetch - About to call Durable Object for:", url.pathname);
			
			// Extract session ID and store Bearer token before calling MCP SDK
			let sessionId: string | null = null;
			
			if (url.pathname === "/sse") {
				// For SSE connections, session ID is in URL parameters
				sessionId = url.searchParams.get("sessionId");
				if (!sessionId) {
					// Generate new session ID for new SSE connections
					sessionId = env.MCP_OBJECT.newUniqueId().toString();
				}
			} else if (url.pathname === "/mcp") {
				// For direct MCP connections, session ID might be in headers
				sessionId = request.headers.get("mcp-session-id");
				if (!sessionId) {
					// Generate new session ID for initialization requests
					sessionId = env.MCP_OBJECT.newUniqueId().toString();
				}
			}
			
			if (sessionId) {
				console.log("Worker fetch - Storing Bearer token for session:", sessionId);
				try {
					const endpointType = url.pathname === "/sse" ? "sse" : "mcp";
					await storeBearerTokenInDO(env, sessionId, token, endpointType);
					console.log("Worker fetch - Bearer token stored successfully");
				} catch (error) {
					console.error("Worker fetch - Failed to store Bearer token:", error);
					return new Response("Internal server error", { status: 500 });
				}
			}
			
			// Continue with normal MCP SDK flow
			if (url.pathname === "/sse" || url.pathname === "/sse/message") {
				return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
			}

			if (url.pathname === "/mcp") {
				return MyMCP.serve("/mcp").fetch(request, env, ctx);
			}
		}

		return new Response("Not found", { status: 404 });
	},
};
