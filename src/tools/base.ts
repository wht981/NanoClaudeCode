/**
 * Base tool implementation
 */
import type { Tool, ToolResult, JSONSchema } from '../types/tool';

export abstract class BaseTool implements Tool {
  public readonly name: string;
  public readonly description: string;
  public readonly parameters: JSONSchema;

  constructor(name: string, description: string, parameters: JSONSchema) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
  }

  /**
   * Abstract method to be implemented by concrete tools
   */
  abstract execute(args: Record<string, unknown>): Promise<ToolResult>;

  /**
   * Validate arguments against the tool's JSON schema
   */
  validateArgs(args: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    // Check required parameters
    if (this.parameters.required) {
      for (const requiredParam of this.parameters.required) {
        if (!(requiredParam in args)) {
          errors.push(`Missing required parameter: ${requiredParam}`);
        }
      }
    }

    // Validate parameter types
    for (const [paramName, paramValue] of Object.entries(args)) {
      const paramSchema = this.parameters.properties[paramName];
      
      if (!paramSchema) {
        if (this.parameters.additionalProperties === false) {
          errors.push(`Unknown parameter: ${paramName}`);
        }
        continue;
      }

      const typeError = this.validateType(paramName, paramValue, paramSchema);
      if (typeError) {
        errors.push(typeError);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate a single parameter's type
   */
  private validateType(
    name: string,
    value: unknown,
    schema: any
  ): string | null {
    if (schema.type === undefined) {
      return null; // No type validation needed
    }

    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = this.getType(value);

    if (!types.includes(actualType)) {
      return `Parameter '${name}' should be ${types.join(' or ')}, got ${actualType}`;
    }

    // Additional validations based on type
    if (actualType === 'string' && typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        return `Parameter '${name}' length must be at least ${schema.minLength}`;
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return `Parameter '${name}' length must be at most ${schema.maxLength}`;
      }
      if (schema.pattern !== undefined) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          return `Parameter '${name}' does not match pattern ${schema.pattern}`;
        }
      }
    }

    if ((actualType === 'number' || actualType === 'integer') && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        return `Parameter '${name}' must be at least ${schema.minimum}`;
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        return `Parameter '${name}' must be at most ${schema.maximum}`;
      }
    }

    if (actualType === 'array' && Array.isArray(value)) {
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const itemError = this.validateType(`${name}[${i}]`, value[i], schema.items);
          if (itemError) {
            return itemError;
          }
        }
      }
    }

    if (actualType === 'object' && value !== null && typeof value === 'object') {
      if (schema.properties) {
        for (const [propName, propValue] of Object.entries(value)) {
          const propSchema = schema.properties[propName];
          if (propSchema) {
            const propError = this.validateType(`${name}.${propName}`, propValue, propSchema);
            if (propError) {
              return propError;
            }
          }
        }
      }

      if (schema.required) {
        for (const requiredProp of schema.required) {
          if (!(requiredProp in value)) {
            return `Parameter '${name}' is missing required property: ${requiredProp}`;
          }
        }
      }
    }

    // Enum validation
    if (schema.enum !== undefined) {
      if (!schema.enum.includes(value)) {
        return `Parameter '${name}' must be one of: ${schema.enum.join(', ')}`;
      }
    }

    return null;
  }

  /**
   * Get the JSON Schema type of a value
   */
  private getType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    
    const jsType = typeof value;
    if (jsType === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    
    return jsType;
  }

  /**
   * Helper method to create a success result
   */
  protected success(output: string, metadata?: Record<string, unknown>): ToolResult {
    return {
      success: true,
      output,
      metadata,
    };
  }

  /**
   * Helper method to create an error result
   */
  protected error(error: string, metadata?: Record<string, unknown>): ToolResult {
    return {
      success: false,
      output: '',
      error,
      metadata,
    };
  }
}
