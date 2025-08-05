import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Replicate from "replicate";
import { registerAllTools } from "./tools";

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
			"Performs basic mathematical addition of two numbers. Use this tool when you need to calculate the sum of two numeric values. Returns the result as a string representation of the sum.",
			{ 
				a: z.number().describe("The first number to add"), 
				b: z.number().describe("The second number to add") 
			},
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			"Advanced calculator tool that performs basic arithmetic operations (addition, subtraction, multiplication, division) on two numbers. Use this tool when you need to perform mathematical calculations beyond simple addition. Handles division by zero errors gracefully. Returns the calculation result or an error message.",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("The arithmetic operation to perform: 'add' for addition, 'subtract' for subtraction, 'multiply' for multiplication, 'divide' for division"),
				a: z.number().describe("The first operand (left side of the operation)"),
				b: z.number().describe("The second operand (right side of the operation)"),
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

		// Register separated tools with Bearer token retrieval function
		const getBearerToken = async (): Promise<string | null> => {
			try {
				console.log("Separated tool - Retrieving Bearer token from storage");
				const token = await this.ctx.storage.get("bearerToken") as string;
				console.log("Separated tool - Bearer token retrieved:", token ? "[present]" : "[missing]");
				return token || null;
			} catch (error) {
				console.error("Separated tool - Failed to retrieve Bearer token:", error);
				return null;
			}
		};

		registerAllTools(this.server, getBearerToken);
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
