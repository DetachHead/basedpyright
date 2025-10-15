# pyright: reportUnusedParameter=none

# The `self` or `cls` parameter of a method should not have a default value


class Foo:
    def instance_method1(self=42) -> None:
        pass

    def instance_method2(self=42, /, *, other=57) -> None:
        pass

    @classmethod
    def class_method(cls=42) -> None:
        pass

    @staticmethod
    def static_method(something=42) -> None:
        pass

    @staticmethod
    def static_method_kwonly(*, something=42) -> None:
        pass

    @staticmethod
    def static_method_pos_only(something=42, /) -> None:
        pass


def normal_function(x=42) -> None:
    pass


def typed_function(x: int = 42) -> None:
    pass
