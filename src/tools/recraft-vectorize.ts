import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Replicate from "replicate";

/**
 * MCP Tool Return Content Types 工具返回内容类型
 * 
 * MCP 支持 5 种不同的 content 类型：
 * 
 * 1. Text Content (文本内容) - 最常用
 *    { type: "text", text: string }
 * 
 * 2. Image Content (图片内容) - 用于返回图片数据
 *    { type: "image", data: string, mimeType: string }
 * 
 * 3. Audio Content (音频内容) - 用于返回音频数据  
 *    { type: "audio", data: string, mimeType: string }
 * 
 * 4. Resource Content (嵌入式资源) - 直接嵌入资源内容
 *    { type: "resource", resource: { uri: string, mimeType: string, text?: string, blob?: string } }
 * 
 * 5. Resource Link Content (资源链接) - 提供资源链接引用
 *    { type: "resource_link", uri: string, name?: string, description?: string, mimeType?: string }
 * 
 * 完整返回结构:
 * {
 *   content: Array<ContentObject>,  // content 对象数组
 *   isError?: boolean,              // 可选：是否为错误结果 (默认 false)
 *   structuredContent?: object      // 可选：结构化内容数据
 * }
 */
const tool_name = "vectorize_image"

export function registerRecraftVectorizeTool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        tool_name,
        "Convert raster images to high-quality SVG format with precision and clean vector paths, perfect for logos, icons, and scalable graphics. This tool transforms PNG, JPG, and WEBP images into scalable SVG vector graphics while preserving visual fidelity and design intent.",
        {
            image: z.string().url("Must be a valid image URL").describe("Raster image URL to convert to SVG format. Supported formats: PNG, JPG, WEBP. Max 5MB, max 16MP, max dimension 4096px, min dimension 256px. Must be a publicly accessible URL"),
        },
        async ({ image }) => {
            // Retrieve Bearer token using the provided function
            const apiKey = await getBearerToken();
            console.log("Tool execution - Bearer token retrieved:", apiKey ? "[present]" : "[missing]");
            
            if (!apiKey) {
                return {
                    content: [
                        {
                            // 使用 Text Content 类型返回结构化的错误信息
                            // 可选的其他类型：image, audio, resource, resource_link
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "error",
                                error_code: "MISSING_API_KEY",
                                message: "Replicate API key not available. Please provide a valid Bearer token in the Authorization header.",
                                filepath: null,
                                metadata: null
                            }, null, 2)
                        }
                    ],
                    // 标记为错误结果，让 LLM 知道这是一个错误状态
                    isError: true
                };
            }

            try {
                const replicate = new Replicate({
                    auth: apiKey,
                });

                const input = {
                    image: image
                };

                const output = await replicate.run("recraft-ai/recraft-vectorize", { input });
                
                return {
                    content: [
                        {
                            // 当前使用 Text Content 类型返回成功结果的结构化数据
                            // 
                            // 未来可考虑的其他返回类型：
                            // 
                            // 1. Resource Link 类型 - 直接提供 SVG 链接：
                            // { 
                            //   type: "resource_link", 
                            //   uri: output, 
                            //   name: "Vectorized SVG", 
                            //   mimeType: "image/svg+xml" 
                            // }
                            // 
                            // 2. Image Content 类型 - 如果需要返回 base64 编码的 SVG：
                            // { 
                            //   type: "image", 
                            //   data: "base64-encoded-svg-data", 
                            //   mimeType: "image/svg+xml" 
                            // }
                            // 
                            // 3. Resource Content 类型 - 嵌入完整的 SVG 文件内容：
                            // { 
                            //   type: "resource", 
                            //   resource: { 
                            //     uri: "vectorized://svg", 
                            //     mimeType: "image/svg+xml", 
                            //     text: "SVG文件内容" 
                            //   } 
                            // }
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "success",
                                filepath: `${output}`,  // 保留 ${output} 结果 - 这是正确的 Recraft API 返回值
                                message: "Image vectorized successfully. The raster image has been converted to high-quality SVG format with clean vector paths.",
                                metadata: {
                                    original_image: image,
                                    output_format: "image/svg+xml",
                                    model: "recraft-ai/recraft-vectorize"
                                }
                            }, null, 2)
                        }
                    ],
                    
                };
            } catch (error) {
                return {
                    content: [
                        {
                            // 使用 Text Content 类型返回异常错误信息
                            // 包含详细的错误信息和请求参数，便于调试
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "error",
                                error_code: "VECTORIZATION_FAILED",
                                message: `Error vectorizing image: ${error instanceof Error ? error.message : String(error)}`,
                                filepath: null,
                                metadata: {
                                    original_image: image,
                                    model: "recraft-ai/recraft-vectorize"
                                }
                            }, null, 2)
                        }
                    ],
                    // 明确标记为错误结果
                    isError: true
                };
            }
        }
    );
}