import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRecraftSVGTool } from "./recraft-svg.js";

interface Env {
    REPLICATE_API_TOKEN?: string;
}

export function registerAllTools(server: McpServer, env: Env) {
    // Only register Recraft SVG tool if API token is available
    if (env.REPLICATE_API_TOKEN) {
        registerRecraftSVGTool(server, { REPLICATE_API_TOKEN: env.REPLICATE_API_TOKEN });
    }
}