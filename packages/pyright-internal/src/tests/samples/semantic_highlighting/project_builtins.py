x = 0
y = x + some_global

def scope():
    some_global = 3
    y = x + some_global


def in_function():
    y = x + some_global
