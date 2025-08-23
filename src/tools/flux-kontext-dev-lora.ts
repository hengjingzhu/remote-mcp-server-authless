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
const tool_name = "edit_image_with_lora"

export function registerFluxKontextDevLoraTool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        tool_name,
        "image editing model with LoRA finetune support. Specialized for editing images to make women's figures more flattering and body-positive.  Ideal for portrait enhancement and body-positive image modifications.",
        {
            input_image: z.string().url("Must be a valid image URL").describe("Image to use as reference for image editing. Must be jpeg, png, gif, or webp format. This is the source image that will be modified"),
            prompt: z.string().optional().default("make the woman's breasts huge and her hips wider").describe("don't need to fill this field,we have the default"),
            lora_weights: z.string().optional().default("civitai.com/models/1904089").describe("Path to the LoRA weights. Currently supports the specified CivitAI model for body-positive image editing"),
            lora_strength: z.number().min(0).max(2).optional().default(1).describe("Strength/scale of the LoRA model influence. Range: 0.0 to 2.0, where 1.0 is normal strength"),
            aspect_ratio: z.enum([
                "match_input_image", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3",
                "4:5", "5:4", "21:9", "9:21", "2:1", "1:2"
            ]).optional().default("match_input_image").describe("Aspect ratio of the generated image. 'match_input_image' preserves the original image proportions"),
            megapixels: z.enum(["1", "0.25"]).optional().default("1").describe("Approximate number of megapixels for generated image. '1' for full quality, '0.25' for faster processing"),
            num_inference_steps: z.number().int().min(4).max(50).optional().default(38).describe("Number of inference steps. Higher values generally produce better quality but take longer"),
            guidance: z.number().min(0).max(10).optional().default(3).describe("Guidance scale for generation. Higher values make the model follow the prompt more closely"),
            go_fast: z.boolean().optional().default(true).describe("Enable fast mode for quicker generation. May slightly reduce quality for complex prompts"),
            output_format: z.enum(["webp", "jpg", "png"]).optional().default("png").describe("Output image format. PNG supports transparency, JPG is smaller, WebP offers good compression"),
            output_quality: z.number().int().min(0).max(100).optional().default(95).describe("Quality when saving the output images (0-100). 100 is best quality. Not relevant for PNG outputs"),
            disable_safety_checker: z.boolean().optional().default(true).describe("Disable NSFW safety checker for more flexible editing capabilities"),
            seed: z.number().int().optional().describe("Random seed for reproducible generation. Leave blank for random results"),
            num_outputs: z.number().int().min(1).max(4).optional().default(1).describe("Number of images to generate. Multiple outputs provide more options to choose from"),
        },
        async ({ 
            input_image, 
            prompt, 
            lora_weights, 
            lora_strength, 
            aspect_ratio, 
            megapixels, 
            num_inference_steps, 
            guidance, 
            go_fast, 
            output_format, 
            output_quality, 
            disable_safety_checker, 
            seed,
            num_outputs 
        }) => {
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
                    input_image,
                    prompt,
                    lora_weights,
                    lora_scale: lora_strength,  // Note: API uses lora_scale, but we name it lora_strength for clarity
                    aspect_ratio,
                    megapixels,
                    num_inference_steps,
                    guidance,
                    go_fast,
                    output_format,
                    output_quality,
                    disable_safety_checker,
                    num_outputs,
                };

                // Only include seed if it's provided
                if (seed !== undefined) {
                    input.seed = seed;
                }

                const output = await replicate.run("black-forest-labs/flux-kontext-dev-lora", { input });
                
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
                            //   name: "Edited Image with LoRA", 
                            //   mimeType: `image/${output_format}` 
                            // }
                            // 
                            // 2. Image Content 类型 - 如果需要返回 base64 编码的图片：
                            // { 
                            //   type: "image", 
                            //   data: "base64-encoded-image-data", 
                            //   mimeType: `image/${output_format}` 
                            // }
                            // 
                            // 3. Resource Content 类型 - 嵌入完整的图片文件内容：
                            // { 
                            //   type: "resource", 
                            //   resource: { 
                            //     uri: "generated://image-with-lora", 
                            //     mimeType: `image/${output_format}`, 
                            //     blob: "base64-encoded-image-data" 
                            //   } 
                            // }
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "success",
                                filepath: `${output}`,  // 保留 ${output} 结果 - 这是正确的 FLUX Kontext Dev LoRA API 返回值
                                message: "Image edited successfully with LoRA model. Do not direct return this filepath url to user, we will upload to our own server",
                                metadata: {
                                    prompt: prompt,
                                    input_image: input_image,
                                    lora_weights: lora_weights,
                                    lora_strength: lora_strength,
                                    aspect_ratio: aspect_ratio,
                                    megapixels: megapixels,
                                    num_inference_steps: num_inference_steps,
                                    guidance: guidance,
                                    go_fast: go_fast,
                                    output_format: output_format,
                                    output_quality: output_quality,
                                    disable_safety_checker: disable_safety_checker,
                                    seed: seed || null,
                                    num_outputs: num_outputs
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
                                message: `Error editing image with LoRA: ${error instanceof Error ? error.message : String(error)}`,
                                filepath: null,
                                metadata: {
                                    prompt: prompt,
                                    input_image: input_image,
                                    lora_weights: lora_weights,
                                    lora_strength: lora_strength,
                                    aspect_ratio: aspect_ratio,
                                    megapixels: megapixels,
                                    num_inference_steps: num_inference_steps,
                                    guidance: guidance,
                                    go_fast: go_fast,
                                    output_format: output_format,
                                    output_quality: output_quality,
                                    disable_safety_checker: disable_safety_checker,
                                    seed: seed || null,
                                    num_outputs: num_outputs
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