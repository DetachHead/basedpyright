class C:
    def __init__(self, x):
        self.x = x

    @classmethod
    def m(cls):
        return cls(1)

def f(x, y: int):
    def g(x):
        return x * y
    z = 2 + x
    return g(z)

lambda a, b: a + b
