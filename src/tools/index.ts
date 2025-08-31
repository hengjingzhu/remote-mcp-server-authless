import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerRecraftSVGTool } from "./recraft-svg";
import { registerRecraftV3Tool } from "./recraft-v3";
import { registerRecraftVectorizeTool } from "./recraft-vectorize";
import { registerWanI2VFastTool } from "./wan-i2v-fast";
import { registerSeedanceProTool } from "./seedance-pro";
import { registerRunwaymlGen4ImageTool } from "./runwayml-gen4-image";
import { registerFluxKontextProTool } from "./flux-kontext-pro";
import { registerFluxKontextDevLoraTool } from "./flux-kontext-dev-lora";
import { registerQwenImageEditTool } from "./qwen-image-edit";

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
    
    // Register Recraft Vectorize tool with Bearer token retrieval function
    registerRecraftVectorizeTool(server, getBearerToken);
    
    // Register WAN 2.2 i2v-fast video generation tool with Bearer token retrieval function
    registerWanI2VFastTool(server, getBearerToken);
    
    // Register ByteDance SeedanceV1-Pro video generation tool with Bearer token retrieval function
    registerSeedanceProTool(server, getBearerToken);
    
    // Register RunwayML Gen4-Image generation tool with Bearer token retrieval function
    // registerRunwaymlGen4ImageTool(server, getBearerToken);
    
    // Register FLUX.1 Kontext Pro image editing tool with Bearer token retrieval function
    registerFluxKontextProTool(server, getBearerToken);
    
    // Register FLUX.1 Kontext Dev LoRA image editing tool with Bearer token retrieval function
    registerFluxKontextDevLoraTool(server, getBearerToken);
    
    // Register Qwen Image Edit tool for text editing in images with Bearer token retrieval function
    registerQwenImageEditTool(server, getBearerToken);
}