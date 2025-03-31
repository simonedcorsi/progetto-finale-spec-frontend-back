import fs, { existsSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { fileURLToPath } from 'url';

// Create __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Verifica l'esistenza del file types.ts prima di avviare il server
const typesFilePath = path.join(__dirname, 'types.ts');
if (!existsSync(typesFilePath)) {
    console.error("⛔ Errore: Il file types.ts non esiste. Questo file è necessario per il funzionamento del server. Per favore, crea il file e riavvia il server.");
    process.exit(1); // Termina il processo con un codice di errore
}

function generateSchemaFromTypes() {
  // Read the types.ts file
  const typesPath = path.join(__dirname, 'types.ts');
  const typesContent = fs.readFileSync(typesPath, 'utf-8');

  // Parse the TypeScript file
  const sourceFile = ts.createSourceFile(
    'types.ts',
    typesContent,
    ts.ScriptTarget.ESNext,
    true
  );

  // Find all exported type declarations
  const exportedTypes = [];
  ts.forEachChild(sourceFile, node => {
    if (ts.isTypeAliasDeclaration(node) && 
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      exportedTypes.push(node);
    }
  });

  if (exportedTypes.length === 0) {
    console.error('⛔ Errore: Non sono stati trovati tipi esportati in types.ts. Assicurati di avere almeno un tipo esportato e riavvia il server.');
    process.exit(1); // Termina il processo con un codice di errore
  }

  // Generate schemas for all exported types
  const schemaImports = ['import z from \'zod\';'];
  const schemaDefinitions = [];
  const validationFunctions = [];
  const exportedValidators = [];
  const readonlyPropertiesList = [];

  exportedTypes.forEach(typeDecl => {
    const typeName = typeDecl.name.text;
    const schemaName = `${typeName}Schema`;
    const validatorName = `validate${typeName}`;
    exportedValidators.push(validatorName);

    // Track readonly properties for this type
    const readonlyProperties = [];

    // Generate Zod schema based on the properties in the type
    const schemaProperties = [];
    
    // Track if required properties are present
    const hasTitle = { present: false };
    const hasCategory = { present: false };
    
    if (ts.isTypeLiteralNode(typeDecl.type)) {
      typeDecl.type.members.forEach(member => {
        if (ts.isPropertySignature(member) && member.name) {
          const propName = member.name.getText(sourceFile);
          const isOptional = member.questionToken !== undefined;
          const isReadonly = hasModifier(member, ts.SyntaxKind.ReadonlyKeyword);
          
          // Track readonly properties
          if (isReadonly) {
            readonlyProperties.push(propName);
          }
          
          // Skip readonly properties for validation as they're set by the server
          if (propName === 'id' || propName === 'createdAt' || propName === 'updatedAt') {
            return;
          }
          
          // Track required properties
          if (propName === 'title') {
            hasTitle.present = true;
            // Ensure title is a string
            schemaProperties.push(`  ${propName}: z.string({ required_error: "Title is required" })${isOptional ? '.optional()' : ''},`);
          } 
          else if (propName === 'category') {
            hasCategory.present = true;
            // Ensure category is a string
            schemaProperties.push(`  ${propName}: z.string({ required_error: "Category is required" })${isOptional ? '.optional()' : ''},`);
          }
          else {
            let zodType = generateZodTypeForNode(member.type, sourceFile, propName);
            
            // Add optional modifier if needed
            if (isOptional) {
              zodType = `${zodType}.optional()`;
            }
            
            // Add a comment for readonly properties
            const readonlyComment = isReadonly ? ' // readonly in TypeScript' : '';
            
            schemaProperties.push(`  ${propName}: ${zodType},${readonlyComment}`);
          }
        }
      });
    }
    
    // Force add required properties if missing
    if (!hasTitle.present) {
      schemaProperties.push(`  title: z.string({ required_error: "Title is required" })`);
    }
    if (!hasCategory.present) {
      schemaProperties.push(`  category: z.string({ required_error: "Category is required" })`);
    }

    // Add this type's readonly properties to the master list
    readonlyPropertiesList.push(`  "${typeName.toLowerCase()}": [${readonlyProperties.map(prop => `"${prop}"`).join(', ')}]`);

    // Add schema definition
    schemaDefinitions.push(`
// Schema generated from types.ts ${typeName} type
export const ${schemaName} = z.object({
  id: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
${schemaProperties.join('\n')}
}).strict(); // Add strict mode to reject extra properties`);

    // Add validation function
    validationFunctions.push(`
export function ${validatorName}(data) {
  try {
    const result = ${schemaName}.parse(data);
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
}`);
  });

  // Generate the schema.js content
  const schemaContent = `// THIS FILE IS AUTO-GENERATED from types.ts - DO NOT EDIT DIRECTLY
${schemaImports.join('\n')}

${schemaDefinitions.join('\n')}

${validationFunctions.join('\n')}

// Export all validators as a map for dynamic usage
export const validators = {
  ${exportedValidators.map(name => `"${name.replace('validate', '').toLowerCase()}": ${name}`).join(',\n  ')}
};

// Export readonly properties for each type to prevent updates
export const readonlyProperties = {
${readonlyPropertiesList.join(',\n')}
};
`;

  // Write the schema.js file
  const schemaPath = path.join(__dirname, 'schema.js');
  fs.writeFileSync(schemaPath, schemaContent);
  console.log('Generato schema.js da types.ts');
}

// Helper function to check if a node has a specific modifier
function hasModifier(node, modifierKind) {
  return node.modifiers && node.modifiers.some(mod => mod.kind === modifierKind);
}

// Generate Zod validation for different TypeScript types
function generateZodTypeForNode(typeNode, sourceFile, propName) {
  if (!typeNode) return 'z.any()';
  
  // Handle different TypeScript types
  if (typeNode.kind === ts.SyntaxKind.StringKeyword) {
    return 'z.string()';
  } 
  else if (typeNode.kind === ts.SyntaxKind.NumberKeyword) {
    return 'z.number()';
  } 
  else if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
    return 'z.boolean()';
  } 
  else if (ts.isArrayTypeNode(typeNode)) {
    const elementType = generateZodTypeForNode(typeNode.elementType, sourceFile);
    return `z.array(${elementType})`;
  } 
  else if (ts.isUnionTypeNode(typeNode)) {
    const unionTypes = typeNode.types.map(t => generateZodTypeForNode(t, sourceFile));
    return `z.union([${unionTypes.join(', ')}])`;
  } 
  else if (ts.isLiteralTypeNode(typeNode)) {
    if (ts.isStringLiteral(typeNode.literal)) {
      return `z.literal("${typeNode.literal.text}")`;
    } else if (ts.isNumericLiteral(typeNode.literal)) {
      return `z.literal(${typeNode.literal.text})`;
    } else if (typeNode.literal.kind === ts.SyntaxKind.TrueKeyword) {
      return 'z.literal(true)';
    } else if (typeNode.literal.kind === ts.SyntaxKind.FalseKeyword) {
      return 'z.literal(false)';
    } else if (typeNode.literal.kind === ts.SyntaxKind.NullKeyword) {
      return 'z.literal(null)';
    }
    return 'z.any()';
  } 
  else if (ts.isTupleTypeNode(typeNode)) {
    const tupleTypes = typeNode.elements.map(e => generateZodTypeForNode(e, sourceFile));
    return `z.tuple([${tupleTypes.join(', ')}])`;
  } 
  else if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(sourceFile);
    if (typeName === 'Date') {
      return 'z.string().datetime("Invalid date format")';
    }
    return 'z.any()';
  } 
  else if (typeNode.kind === ts.SyntaxKind.ObjectKeyword) {
    return 'z.record(z.any())';
  }
  
  // For any other types
  return 'z.any()';
}

generateSchemaFromTypes();
