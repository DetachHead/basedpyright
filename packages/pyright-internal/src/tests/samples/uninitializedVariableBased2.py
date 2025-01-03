class C:
    x: int  # should not be reported as uninitialized

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.x = 3
