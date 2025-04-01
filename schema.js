// THIS FILE IS AUTO-GENERATED from types.ts - DO NOT EDIT DIRECTLY
import z from 'zod';


// Schema generated from types.ts Owner type
const OwnerSchema = z.object({
    name: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
}).strict(); // Add strict mode to reject extra properties

// Schema generated from types.ts Product type
export const ProductSchema = z.object({
  id: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  title: z.string({ required_error: "Title is required" }),
  category: z.string({ required_error: "Category is required" }),
  owners: z.tuple([OwnerSchema]),
}).strict(); // Add strict mode to reject extra properties

// Schema generated from types.ts Course type
export const CourseSchema = z.object({
  id: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  title: z.string({ required_error: "Title is required" }),
  category: z.string({ required_error: "Category is required" }),
  price: z.number(),
  description: z.string().optional(),
  teacherName: z.string(),
  imageUrl: z.string().optional(),
}).strict(); // Add strict mode to reject extra properties


export function validateProduct(data) {
  try {
    const result = ProductSchema.parse(data);
    return { valid: true, data: result };
  } catch (error) {
    return { 
      valid: false, 
      errors: error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
    };
  }
}

export function validateCourse(data) {
  try {
    const result = CourseSchema.parse(data);
    return { valid: true, data: result };
  } catch (error) {
    return { 
      valid: false, 
      errors: error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }))
    };
  }
}

// Export all validators as a map for dynamic usage
export const validators = {
  "product": validateProduct,
  "course": validateCourse
};

// Export readonly properties for each type to prevent updates
export const readonlyProperties = {
  "product": [],
  "course": []
};
