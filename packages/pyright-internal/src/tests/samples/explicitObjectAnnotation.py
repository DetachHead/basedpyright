# This file is used to test that the 'reportAny' diagnostic is skipped for explicit 'object' annotations.

def func(param: object):
    print(param)  # Use the parameter to avoid triggering 'reportUnusedParameter'.

lambda_func = lambda x: x  # Explicitly annotated as 'object' in the test.