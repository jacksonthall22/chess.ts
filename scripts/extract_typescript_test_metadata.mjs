#!/usr/bin/env node

import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../chess/package.json', import.meta.url))
const ts = require('typescript')

const propertyName = name => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text
  }
  return null
}

const registrations = []

for (const filePath of process.argv.slice(2)) {
  const source = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  const fail = (node, message) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    )
    throw new Error(`${filePath}:${line + 1}:${character + 1}: ${message}`)
  }

  if (sourceFile.parseDiagnostics.length > 0) {
    const diagnostic = sourceFile.parseDiagnostics[0]
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    fail(sourceFile, `TypeScript parse error: ${message}`)
  }

  const classes = new Map()
  for (const statement of sourceFile.statements) {
    if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      classes.set(
        statement.name.text,
        new Set(
          statement.members
            .filter(ts.isMethodDeclaration)
            .map(member => propertyName(member.name))
            .filter(name => name !== null && name.startsWith('test')),
        ),
      )
    }
  }

  const visit = node => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'registerTestCase'
    ) {
      if (
        !ts.isExpressionStatement(node.parent) ||
        node.parent.parent !== sourceFile
      ) {
        fail(node, 'registerTestCase() must be a direct top-level statement')
      }

      if (node.arguments.length !== 3) {
        fail(node, 'registerTestCase() must receive exactly three arguments')
      }

      const [labelNode, classNode, metadataNode] = node.arguments
      if (!ts.isStringLiteral(labelNode)) {
        fail(labelNode, 'the registered test-case label must be a string literal')
      }
      if (!ts.isIdentifier(classNode)) {
        fail(classNode, 'the registered test case must be a class identifier')
      }
      if (!ts.isObjectLiteralExpression(metadataNode)) {
        fail(metadataNode, 'test-case metadata must be an object literal')
      }

      const label = labelNode.text
      const className = classNode.text
      if (label !== className) {
        fail(node, `${className} is registered under the mismatched label ${label}`)
      }

      const classMethods = classes.get(className)
      if (classMethods === undefined) {
        fail(classNode, `no top-level ${className} class declaration exists`)
      }

      const linesProperties = metadataNode.properties.filter(
        property =>
          ts.isPropertyAssignment(property) &&
          propertyName(property.name) === 'lines',
      )
      if (linesProperties.length !== 1) {
        fail(metadataNode, 'metadata must contain exactly one lines property')
      }

      const linesNode = linesProperties[0].initializer
      if (!ts.isObjectLiteralExpression(linesNode)) {
        fail(linesNode, 'metadata.lines must be an object literal')
      }

      const registeredMethods = new Set()
      for (const property of linesNode.properties) {
        if (!ts.isPropertyAssignment(property)) {
          fail(property, 'metadata.lines entries must be property assignments')
        }

        const methodName = propertyName(property.name)
        if (methodName === null || !methodName.startsWith('test')) {
          fail(property.name, 'metadata.lines keys must be test method names')
        }
        if (!ts.isNumericLiteral(property.initializer)) {
          fail(property.initializer, 'metadata.lines values must be numeric literals')
        }

        const line = Number(property.initializer.text)
        if (!Number.isSafeInteger(line) || line < 1) {
          fail(property.initializer, 'metadata source lines must be positive integers')
        }
        if (!classMethods.has(methodName)) {
          fail(property.name, `${className}.${methodName} is not declared`)
        }
        if (registeredMethods.has(methodName)) {
          fail(property.name, `${className}.${methodName} is registered twice`)
        }

        registeredMethods.add(methodName)
        registrations.push({
          path: filePath,
          className,
          methodName,
          line,
        })
      }

      const missingMethods = [...classMethods].filter(
        methodName => !registeredMethods.has(methodName),
      )
      if (missingMethods.length > 0) {
        fail(
          linesNode,
          `metadata.lines omits ${className}.${missingMethods.join(`, ${className}.`)}`,
        )
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

process.stdout.write(JSON.stringify(registrations))
