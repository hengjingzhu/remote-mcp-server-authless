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
const tool_name = "edit_image_flux_kontext_pro"

export function registerFluxKontextProTool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        tool_name,
        "State-of-the-art text-based image editing. Excels at style transfer, object/clothing changes, text editing, background swapping, and character consistency. Delivers high-quality outputs with excellent prompt following and consistent results for transforming images through natural language instructions.",
        {
            prompt: z.string().min(1, "Prompt is required").describe("Detailed English text description of what you want to do to the image or how to edit it. Be specific about changes you want to make. Examples: 'Make this a 90s cartoon', 'Change the background to a beach while keeping the person', 'Replace the text with new text'"),
            input_image: z.string().url("Must be a valid image URL").describe("URL of the image to edit. Must be a valid URL pointing to a jpeg, png, gif, or webp image file"),
            aspect_ratio: z.enum([
                "match_input_image", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", 
                "4:5", "5:4", "21:9", "9:21", "2:1", "1:2"
            ]).optional().default("match_input_image").describe("Aspect ratio of the edited image. Use 'match_input_image' to preserve the original aspect ratio. Common ratios: '1:1' for square, '16:9' for widescreen, '9:16' for portrait"),
            output_format: z.enum(["jpg", "png"]).optional().default("png").describe("Output format for the edited image. 'jpg' for smaller file size, 'png' for better quality and transparency support"),
            safety_tolerance: z.number().int().min(0).max(6).optional().default(2).describe("Safety tolerance level from 0 (most strict) to 6 (most permissive). Maximum allowed is 2 when input images are used for safety reasons"),
            prompt_upsampling: z.boolean().optional().default(false).describe("Enable automatic prompt improvement to enhance the quality and effectiveness of your text prompt"),
            seed: z.number().int().optional().describe("Random seed for reproducible generation. Set this to get the same result with identical inputs. Leave undefined for random results"),
        },
        async ({ prompt, input_image, aspect_ratio, output_format, safety_tolerance, prompt_upsampling, seed }) => {
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

                const input: any = {
                    prompt,
                    input_image,
                    aspect_ratio,
                    output_format,
                    safety_tolerance,
                    prompt_upsampling,
                };

                // Only include seed if it's provided
                if (seed !== undefined) {
                    input.seed = seed;
                }

                const output = await replicate.run("black-forest-labs/flux-kontext-pro", { input });
                
                return {
                    content: [
                        {
                            // 当前使用 Text Content 类型返回成功结果的结构化数据
                            // 
                            // 未来可考虑的其他返回类型：
                            // 
                            // 1. Resource Link 类型 - 直接提供图片链接：
                            // { 
                            //   type: "resource_link", 
                            //   uri: output, 
                            //   name: "Edited Image", 
                            //   mimeType: output_format === "jpg" ? "image/jpeg" : "image/png" 
                            // }
                            // 
                            // 2. Image Content 类型 - 如果需要返回 base64 编码的图片：
                            // { 
                            //   type: "image", 
                            //   data: "base64-encoded-image-data", 
                            //   mimeType: output_format === "jpg" ? "image/jpeg" : "image/png" 
                            // }
                            // 
                            // 3. Resource Content 类型 - 嵌入完整的图片文件内容：
                            // { 
                            //   type: "resource", 
                            //   resource: { 
                            //     uri: "edited://image", 
                            //     mimeType: output_format === "jpg" ? "image/jpeg" : "image/png", 
                            //     blob: "base64-encoded-image-data" 
                            //   } 
                            // }
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "success",
                                filepath: `${output}`,  // 保留 ${output} 结果 - 这是正确的 Flux Kontext Pro API 返回值
                                message: "Image edited successfully. Do not direct return this filepath url to user, we will upload to our own server",
                                metadata: {
                                    prompt: prompt,
                                    input_image: input_image,
                                    aspect_ratio: aspect_ratio,
                                    output_format: output_format,
                                    safety_tolerance: safety_tolerance,
                                    prompt_upsampling: prompt_upsampling,
                                    seed: seed || null
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
                                error_code: "EDITING_FAILED",
                                message: `Error editing image: ${error instanceof Error ? error.message : String(error)}`,
                                filepath: null,
                                metadata: {
                                    prompt: prompt,
                                    input_image: input_image,
                                    aspect_ratio: aspect_ratio,
                                    output_format: output_format,
                                    safety_tolerance: safety_tolerance,
                                    prompt_upsampling: prompt_upsampling,
                                    seed: seed || null
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