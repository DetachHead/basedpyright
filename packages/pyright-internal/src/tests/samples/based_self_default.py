# pyright: reportUnusedParameter=none

# The `self` or `cls` parameter of a method should not have a default value


class Foo:
    def instance_method(self=42) -> None:
        pass

    @classmethod
    def class_method(cls=42) -> None:
        pass

    @staticmethod
    def static_method(something=42) -> None:
        pass


def normal_function(x=42) -> None:
    pass


def typed_function(x: int = 42) -> None:
    pass
