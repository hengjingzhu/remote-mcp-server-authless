import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRecraftSVGTool } from "./recraft-svg";
import { registerRecraftV3Tool } from "./recraft-v3";
import { registerWanI2VFastTool } from "./wan-i2v-fast";
import { registerSeedanceProTool } from "./seedance-pro";

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
    
    // Register WAN 2.2 i2v-fast video generation tool with Bearer token retrieval function
    registerWanI2VFastTool(server, getBearerToken);
    
    // Register ByteDance SeedanceV1-Pro video generation tool with Bearer token retrieval function
    registerSeedanceProTool(server, getBearerToken);
}