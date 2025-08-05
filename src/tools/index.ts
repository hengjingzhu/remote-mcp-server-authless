import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRecraftSVGTool } from "./recraft-svg";
import { registerRecraftV3Tool } from "./recraft-v3";

interface Env {
    E2B_API_KEY: string;
    OAUTH_CLIENT_ID?: string;
    OAUTH_CLIENT_SECRET?: string;
    MCP_OBJECT: DurableObjectNamespace;
}

export function registerAllTools(server: McpServer, getBearerToken: () => Promise<string | null>) {
    // Register Recraft SVG tool with Bearer token retrieval function
    registerRecraftSVGTool(server, getBearerToken);
    
    // Register Recraft V3 image generation tool with Bearer token retrieval function
    registerRecraftV3Tool(server, getBearerToken);
}