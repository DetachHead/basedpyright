/*
 * diagnosticRules.ts
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT license.
 * Author: Eric Traut
 *
 * Strings that represent each of the diagnostic rules
 * that can be enabled or disabled in the configuration.
 */

// Not const enum since keys need to be inspected in tests
// to match declaration of user-visible settings in package.json
export enum DiagnosticRule {
    strictListInference = 'strictListInference',
    strictSetInference = 'strictSetInference',
    strictDictionaryInference = 'strictDictionaryInference',
    analyzeUnannotatedFunctions = 'analyzeUnannotatedFunctions',
    strictParameterNoneValue = 'strictParameterNoneValue',
    enableExperimentalFeatures = 'enableExperimentalFeatures',
    enableTypeIgnoreComments = 'enableTypeIgnoreComments',
    deprecateTypingAliases = 'deprecateTypingAliases',
    disableBytesTypePromotions = 'disableBytesTypePromotions',

    reportGeneralTypeIssues = 'reportGeneralTypeIssues',
    reportPropertyTypeMismatch = 'reportPropertyTypeMismatch',
    reportFunctionMemberAccess = 'reportFunctionMemberAccess',
    reportMissingImports = 'reportMissingImports',
    reportMissingModuleSource = 'reportMissingModuleSource',
    reportInvalidTypeForm = 'reportInvalidTypeForm',
    reportMissingTypeStubs = 'reportMissingTypeStubs',
    reportImportCycles = 'reportImportCycles',
    reportUnusedImport = 'reportUnusedImport',
    reportUnusedClass = 'reportUnusedClass',
    reportUnusedFunction = 'reportUnusedFunction',
    reportUnusedVariable = 'reportUnusedVariable',
    reportDuplicateImport = 'reportDuplicateImport',
    reportWildcardImportFromLibrary = 'reportWildcardImportFromLibrary',
    reportAbstractUsage = 'reportAbstractUsage',
    reportArgumentType = 'reportArgumentType',
    reportAssertTypeFailure = 'reportAssertTypeFailure',
    reportAssignmentType = 'reportAssignmentType',
    reportAttributeAccessIssue = 'reportAttributeAccessIssue',
    reportCallIssue = 'reportCallIssue',
    reportInconsistentOverload = 'reportInconsistentOverload',
    reportIndexIssue = 'reportIndexIssue',
    reportInvalidTypeArguments = 'reportInvalidTypeArguments',
    reportNoOverloadImplementation = 'reportNoOverloadImplementation',
    reportOperatorIssue = 'reportOperatorIssue',
    reportOptionalSubscript = 'reportOptionalSubscript',
    reportOptionalMemberAccess = 'reportOptionalMemberAccess',
    reportOptionalCall = 'reportOptionalCall',
    reportOptionalIterable = 'reportOptionalIterable',
    reportOptionalContextManager = 'reportOptionalContextManager',
    reportOptionalOperand = 'reportOptionalOperand',
    reportRedeclaration = 'reportRedeclaration',
    reportReturnType = 'reportReturnType',
    reportTypedDictNotRequiredAccess = 'reportTypedDictNotRequiredAccess',
    reportUntypedFunctionDecorator = 'reportUntypedFunctionDecorator',
    reportUntypedClassDecorator = 'reportUntypedClassDecorator',
    reportUntypedBaseClass = 'reportUntypedBaseClass',
    reportUntypedNamedTuple = 'reportUntypedNamedTuple',
    reportPrivateUsage = 'reportPrivateUsage',
    reportTypeCommentUsage = 'reportTypeCommentUsage',
    reportPrivateImportUsage = 'reportPrivateImportUsage',
    reportConstantRedefinition = 'reportConstantRedefinition',
    reportDeprecated = 'reportDeprecated',
    reportIncompatibleMethodOverride = 'reportIncompatibleMethodOverride',
    reportIncompatibleVariableOverride = 'reportIncompatibleVariableOverride',
    reportInconsistentConstructor = 'reportInconsistentConstructor',
    reportOverlappingOverload = 'reportOverlappingOverload',
    reportPossiblyUnboundVariable = 'reportPossiblyUnboundVariable',
    reportMissingSuperCall = 'reportMissingSuperCall',
    reportUninitializedInstanceVariable = 'reportUninitializedInstanceVariable',
    reportInvalidStringEscapeSequence = 'reportInvalidStringEscapeSequence',
    reportUnknownParameterType = 'reportUnknownParameterType',
    reportUnknownArgumentType = 'reportUnknownArgumentType',
    reportUnknownLambdaType = 'reportUnknownLambdaType',
    reportUnknownVariableType = 'reportUnknownVariableType',
    reportUnknownMemberType = 'reportUnknownMemberType',
    reportMissingParameterType = 'reportMissingParameterType',
    reportMissingTypeArgument = 'reportMissingTypeArgument',
    reportInvalidTypeVarUse = 'reportInvalidTypeVarUse',
    reportCallInDefaultInitializer = 'reportCallInDefaultInitializer',
    reportUnnecessaryIsInstance = 'reportUnnecessaryIsInstance',
    reportUnnecessaryCast = 'reportUnnecessaryCast',
    reportUnnecessaryComparison = 'reportUnnecessaryComparison',
    reportUnnecessaryContains = 'reportUnnecessaryContains',
    reportAssertAlwaysTrue = 'reportAssertAlwaysTrue',
    reportSelfClsParameterName = 'reportSelfClsParameterName',
    reportImplicitStringConcatenation = 'reportImplicitStringConcatenation',
    reportUndefinedVariable = 'reportUndefinedVariable',
    reportUnboundVariable = 'reportUnboundVariable',
    reportUnhashable = 'reportUnhashable',
    reportInvalidStubStatement = 'reportInvalidStubStatement',
    reportIncompleteStub = 'reportIncompleteStub',
    reportUnsupportedDunderAll = 'reportUnsupportedDunderAll',
    reportUnusedCallResult = 'reportUnusedCallResult',
    reportUnusedCoroutine = 'reportUnusedCoroutine',
    reportUnusedExcept = 'reportUnusedExcept',
    reportUnusedExpression = 'reportUnusedExpression',
    reportUnnecessaryTypeIgnoreComment = 'reportUnnecessaryTypeIgnoreComment',
    reportMatchNotExhaustive = 'reportMatchNotExhaustive',
    reportShadowedImports = 'reportShadowedImports',
    reportImplicitOverride = 'reportImplicitOverride',

    // basedpyright options:
    reportUnreachable = 'reportUnreachable',
    reportAny = 'reportAny',
    reportIgnoreCommentWithoutRule = 'reportIgnoreCommentWithoutRule',
    reportPrivateLocalImportUsage = 'reportPrivateLocalImportUsage',
}
