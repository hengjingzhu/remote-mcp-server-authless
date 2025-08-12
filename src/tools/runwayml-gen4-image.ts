import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Replicate from "replicate";

/**
 * RunwayML Gen-4 Image Generation Tool
 * 
 * Reference-based image generation model that maintains character and location consistency.
 * Supports up to 3 reference images with customizable tags for precise control over generation.
 * 
 * Key Features:
 * - Character preservation across different scenes
 * - Location consistency with multiple angles
 * - Multi-reference support (up to 3 images)
 * - Conversational prompting with @tag_name references
 */
const tool_name = "generate_gen4_image";

export function registerRunwaymlGen4ImageTool(server: McpServer, getBearerToken: () => Promise<string | null>) {
    server.tool(
        tool_name,
        "Advanced reference-based image generation. Maintains character and location consistency across generations using up to 3 reference images. Supports conversational prompting with @tag_name references for precise control. Ideal for character portraits, scene generation, and consistent visual storytelling.",
        {
            prompt: z.string().min(1, "Prompt is required").describe("English text prompt for image generation. Use @tag_name to reference specific images (e.g., '@woman wearing a leather jacket' or 'show @location from above'). Be specific about desired transformations, lighting, poses, and styling."),
            seed: z.number().int().min(0).optional().describe("Random seed for reproducible generation. Use the same seed with identical parameters to get consistent results. Leave empty for random generation."),
            aspect_ratio: z.enum([
                "16:9", "9:16", "4:3", "3:4", "1:1", "21:9"
            ]).optional().default("1:1").describe("Image aspect ratio. '16:9' for widescreen, '9:16' for portrait/mobile, '4:3' for standard, '3:4' for portrait standard, '1:1' for square, '21:9' for ultra-wide. Default is '1:1' (square)."),
            resolution: z.enum([
                "720p", "1080p"
            ]).optional().default("720p").describe("Image resolution quality. '720p(recommend)' for standard quality (faster), '1080p(not recommend)' for high quality (slower). Default is '720p' for optimal speed/quality balance."),
            reference_images: z.array(z.string().url("Must be a valid URL"))
                .max(3, "Maximum 3 reference images allowed")
                .optional()
                .describe("Up to 3 reference image URLs. Images should have aspect ratios between 0.5 and 2.0. Use natural lighting and clear subject visibility for best results. Optional but recommended for character/location consistency."),
            reference_tags: z.array(
                z.string()
                    .min(3, "Tag must be at least 3 characters")
                    .max(15, "Tag must be at most 15 characters")
                    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, "Tag must start with a letter and contain only alphanumeric characters")
            )
                .max(3, "Maximum 3 reference tags allowed")
                .optional()
                .describe("Optional tags for reference images (one tag per image). Tags must be 3-15 characters, start with a letter, and contain only alphanumeric characters. Use these tags in your prompt with @tag_name (e.g., 'woman', 'park', 'castle')."),
        },
        async ({ prompt, seed, aspect_ratio, resolution, reference_images, reference_tags }) => {
            // Retrieve Bearer token using the provided function
            const apiKey = await getBearerToken();
            console.log("Tool execution - Bearer token retrieved:", apiKey ? "[present]" : "[missing]");
            
            if (!apiKey) {
                return {
                    content: [
                        {
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
                    isError: true
                };
            }

            // Validate reference_images and reference_tags consistency
            if (reference_images && reference_tags) {
                if (reference_images.length !== reference_tags.length) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    tool_name: tool_name,
                                    status: "error",
                                    error_code: "MISMATCHED_ARRAYS",
                                    message: "Number of reference_images must match number of reference_tags. Each image should have a corresponding tag.",
                                    filepath: null,
                                    metadata: {
                                        reference_images_count: reference_images.length,
                                        reference_tags_count: reference_tags.length
                                    }
                                }, null, 2)
                            }
                        ],
                        isError: true
                    };
                }
            }

            try {
                const replicate = new Replicate({
                    auth: apiKey,
                });

                // Build input object with only provided parameters
                const input: any = {
                    prompt,
                    aspect_ratio,
                    resolution,
                };

                // Add optional parameters if provided
                if (seed !== undefined) {
                    input.seed = seed;
                }
                
                if (reference_images && reference_images.length > 0) {
                    input.reference_images = reference_images;
                }
                
                if (reference_tags && reference_tags.length > 0) {
                    input.reference_tags = reference_tags;
                }

                console.log("RunwayML Gen4-Image - Input parameters:", JSON.stringify(input, null, 2));

                const output = await replicate.run("runwayml/gen4-image", { input });
                
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "success",
                                filepath: `${output}`,
                                message: "Gen-4 image generated successfully. Do not direct return this filepath url to user, we will upload to our own server",
                                metadata: {
                                    prompt: prompt,
                                    seed: seed || null,
                                    aspect_ratio: aspect_ratio,
                                    resolution: resolution,
                                    reference_images: reference_images || null,
                                    reference_tags: reference_tags || null,
                                    reference_count: reference_images ? reference_images.length : 0
                                }
                            }, null, 2)
                        }
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                tool_name: tool_name,
                                status: "error",
                                error_code: "GENERATION_FAILED",
                                message: `Error generating Gen-4 image: ${error instanceof Error ? error.message : String(error)}`,
                                filepath: null,
                                metadata: {
                                    prompt: prompt,
                                    seed: seed || null,
                                    aspect_ratio: aspect_ratio,
                                    resolution: resolution,
                                    reference_images: reference_images || null,
                                    reference_tags: reference_tags || null
                                }
                            }, null, 2)
                        }
                    ],
                    isError: true
                };
            }
        }
    );
}