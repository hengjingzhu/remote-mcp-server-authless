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
const tool_name = "generate_image"

export function registerRecraftV3Tool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        tool_name,
        "Generates high-quality images using Recraft V3 model. This is SOTA in image generation with ability to generate long texts and images in a wide variety of styles including realistic photos, digital illustrations, and artistic designs. Supports various aspect ratios, sizes, and comprehensive style options for different use cases.",
        {
            prompt: z.string().min(1, "Prompt is required").describe("Detailed English text description of the image to generate. Be specific about style, colors, composition, and visual elements you want to include. Supports long text generation within images"),
            aspect_ratio: z.enum([
                "Not set", "1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", 
                "1:2", "2:1", "7:5", "5:7", "4:5", "5:4", "3:5", "5:3"
            ]).optional().default("Not set").describe("The aspect ratio of the generated image. Common ratios: '1:1' for square, '16:9' for widescreen, '4:3' for standard. Default is 'Not set' which lets the AI choose"),
            size: z.enum([
                "1024x1024", "1365x1024", "1024x1365", "1536x1024", "1024x1536",
                "1820x1024", "1024x1820", "1024x2048", "2048x1024", "1434x1024",
                "1024x1434", "1024x1280", "1280x1024", "1024x1707", "1707x1024"
            ]).optional().default("1024x1024").describe("The pixel dimensions of the generated image. Format is 'WIDTHxHEIGHT'. Default is '1024x1024' for square images. Choose larger sizes for higher detail. Size is ignored if an aspect ratio is set"),
            style: z.enum([
                "any", "realistic_image", "digital_illustration",
                "digital_illustration/pixel_art", "digital_illustration/hand_drawn", 
                "digital_illustration/grain", "digital_illustration/infantile_sketch",
                "digital_illustration/2d_art_poster", "digital_illustration/handmade_3d",
                "digital_illustration/hand_drawn_outline", "digital_illustration/engraving_color",
                "digital_illustration/2d_art_poster_2", "realistic_image/b_and_w",
                "realistic_image/hard_flash", "realistic_image/hdr", "realistic_image/natural_light",
                "realistic_image/studio_portrait", "realistic_image/enterprise", "realistic_image/motion_blur"
            ]).optional().default("any").describe("The artistic style to apply to the image. 'any' for default, 'realistic_image' for photography-like results, 'digital_illustration' for artistic designs. Various sub-styles available for specific looks"),
        },
        async ({ prompt, aspect_ratio, size, style }) => {
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
                    size,
                    aspect_ratio,
                };

                if (style) {
                    input.style = style;
                }

                const output = await replicate.run("recraft-ai/recraft-v3", { input });
                
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
                            //   name: "Generated Image", 
                            //   mimeType: "image/webp" 
                            // }
                            // 
                            // 2. Image Content 类型 - 如果需要返回 base64 编码的图片：
                            // { 
                            //   type: "image", 
                            //   data: "base64-encoded-image-data", 
                            //   mimeType: "image/webp" 
                            // }
                            // 
                            // 3. Resource Content 类型 - 嵌入完整的图片文件内容：
                            // { 
                            //   type: "resource", 
                            //   resource: { 
                            //     uri: "generated://image", 
                            //     mimeType: "image/webp", 
                            //     blob: "base64-encoded-image-data" 
                            //   } 
                            // }
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "success",
                                filepath: `${output}`,  // 保留 ${output} 结果 - 这是正确的 Recraft API 返回值
                                message: "Image generated successfully.Do not direct return this url to user,we will upload to our own server",
                                metadata: {
                                    prompt: prompt,
                                    size: size,
                                    aspect_ratio: aspect_ratio,
                                    style: style || null
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
                                error_code: "GENERATION_FAILED",
                                message: `Error generating image: ${error instanceof Error ? error.message : String(error)}`,
                                filepath: null,
                                metadata: {
                                    prompt: prompt,
                                    size: size,
                                    aspect_ratio: aspect_ratio,
                                    style: style || null
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