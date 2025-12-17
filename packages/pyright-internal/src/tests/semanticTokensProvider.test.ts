import { semanticTokenizeSampleFile } from './testUtils';

//TODO: these tests have different start positions in ci on windows, i assume because of crlf moment
if (process.platform !== 'win32' || !process.env['CI']) {
    test('variable', () => {
        const result = semanticTokenizeSampleFile('variable.py');
        expect(result).toStrictEqual([
            { type: 'variable', start: 0, length: 3, modifiers: [] },
            { type: 'variable', start: 8, length: 3, modifiers: [] },
            { type: 'variable', start: 20, length: 3, modifiers: [] },
        ]);
    });

    test('class_members', () => {
        const result = semanticTokenizeSampleFile('class_members.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 7, length: 2 }, // os
            { type: 'namespace', modifiers: [], start: 15, length: 6 }, // typing
            { type: 'type', modifiers: [], start: 29, length: 3 }, // Any
            { type: 'class', modifiers: [], start: 34, length: 8 }, // Callable
            { type: 'class', modifiers: [], start: 44, length: 5 }, // Final
            { type: 'class', modifiers: [], start: 51, length: 7 }, // TypeVar
            // class A
            { type: 'class', modifiers: ['declaration'], start: 67, length: 1 }, // A
            // cvar
            { type: 'property', modifiers: ['classMember', 'static'], start: 74, length: 4 }, // cvar
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 80, length: 3 }, // int
            // __init__
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 97, length: 8 }, // __init__
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 106, length: 4 }, // self
            { type: 'function', modifiers: ['declaration', 'parameter'], start: 112, length: 1 }, // f
            { type: 'class', modifiers: [], start: 115, length: 8 }, // Callable
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 128, length: 3 }, // int
            { type: 'class', modifiers: ['declaration', 'parameter'], start: 134, length: 1 }, // t
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 137, length: 4 }, // type
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 142, length: 3 }, // int
            { type: 'selfParameter', modifiers: ['parameter'], start: 157, length: 4 }, // self
            { type: 'function', modifiers: ['readonly', 'classMember'], start: 162, length: 1 }, // f
            { type: 'class', modifiers: [], start: 165, length: 5 }, // Final
            { type: 'class', modifiers: [], start: 171, length: 8 }, // Callable
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 184, length: 3 }, // int
            { type: 'function', modifiers: ['parameter'], start: 192, length: 1 }, // f
            { type: 'selfParameter', modifiers: ['parameter'], start: 202, length: 4 }, // self
            { type: 'class', modifiers: ['classMember'], start: 207, length: 1 }, // t
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 210, length: 4 }, // type
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 215, length: 3 }, // int
            { type: 'class', modifiers: ['parameter'], start: 222, length: 1 }, // t
            // b
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 247, length: 1 }, // b
            { type: 'decorator', modifiers: [], start: 229, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 230, length: 8 }, // property
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 249, length: 4 }, // self
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 258, length: 3 }, // int
            { type: 'selfParameter', modifiers: ['parameter'], start: 278, length: 4 }, // self
            { type: 'function', modifiers: ['readonly', 'classMember'], start: 283, length: 1 }, // f
            // b.setter
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 310, length: 1 }, // b
            { type: 'decorator', modifiers: [], start: 292, length: 1 }, // @
            { type: 'property', modifiers: ['classMember'], start: 293, length: 1 }, // b
            { type: 'method', modifiers: ['classMember'], start: 295, length: 6 }, // setter
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 312, length: 4 }, // self
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 318, length: 5 }, // value
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 325, length: 3 }, // int
            // d
            { type: 'method', modifiers: ['declaration', 'static', 'classMember'], start: 379, length: 1 }, // d
            { type: 'decorator', modifiers: [], start: 357, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 358, length: 12 }, // staticmethod
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 381, length: 1 }, // i
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 384, length: 3 }, // int
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 392, length: 5 }, // float
            { type: 'parameter', modifiers: ['parameter'], start: 414, length: 1 }, // i
            // __getattr__
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 431, length: 11 }, // __getattr__
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 443, length: 4 }, // self
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 449, length: 4 }, // name
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 455, length: 3 }, // str
            { type: 'class', modifiers: [], start: 463, length: 8 }, // Callable
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 476, length: 5 }, // float
            // ufun0
            { type: 'function', modifiers: ['declaration'], start: 517, length: 5 }, // ufun0
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 523, length: 1 }, // a
            { type: 'parameter', modifiers: ['parameter'], start: 531, length: 1 }, // a
            { type: 'parameter', modifiers: ['parameter'], start: 535, length: 1 }, // a
            // ufun1
            { type: 'function', modifiers: ['declaration'], start: 555, length: 5 }, // ufun1
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 561, length: 1 }, // b
            { type: 'type', modifiers: [], start: 564, length: 3 }, // Any
            { type: 'type', modifiers: [], start: 572, length: 3 }, // Any
            { type: 'parameter', modifiers: ['parameter'], start: 588, length: 1 }, // b
            // a = A(lambda: int(A.d(3)), int)
            { type: 'variable', modifiers: [], start: 611, length: 1 }, // a
            { type: 'class', modifiers: [], start: 615, length: 1 }, // A
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 625, length: 3 }, // int
            { type: 'class', modifiers: [], start: 629, length: 1 }, // A
            { type: 'method', modifiers: ['static', 'classMember'], start: 631, length: 1 }, // d
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 638, length: 3 }, // int
            // print(a.b, a.f, os.path.pardir)
            { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 643, length: 5 }, // print
            { type: 'variable', modifiers: [], start: 649, length: 1 }, // a
            { type: 'property', modifiers: ['classMember'], start: 651, length: 1 }, // b
            { type: 'variable', modifiers: [], start: 654, length: 1 }, // a
            { type: 'function', modifiers: ['readonly', 'classMember'], start: 656, length: 1 }, // f
            { type: 'namespace', modifiers: [], start: 659, length: 2 }, // os
            { type: 'namespace', modifiers: [], start: 662, length: 4 }, // path
            { type: 'variable', modifiers: [], start: 667, length: 6 }, // pardir
            // c = a.t
            { type: 'class', modifiers: [], start: 675, length: 1 }, // c
            { type: 'variable', modifiers: [], start: 679, length: 1 }, // a
            { type: 'class', modifiers: ['classMember'], start: 681, length: 1 }, // t
            // d: Any = a.abc()
            { type: 'variable', modifiers: [], start: 683, length: 1 }, // d
            { type: 'type', modifiers: [], start: 686, length: 3 }, // Any
            { type: 'variable', modifiers: [], start: 692, length: 1 }, // a
            { type: 'function', modifiers: ['classMember', 'readonly'], start: 694, length: 3 }, // abc
            // A.cvar = 4 + d.is_integer()
            { type: 'class', modifiers: [], start: 700, length: 1 }, // A
            { type: 'property', modifiers: ['classMember', 'static'], start: 702, length: 4 }, // cvar
            { type: 'variable', modifiers: [], start: 713, length: 1 }, // d
            // e = ufun1(12)
            { type: 'variable', modifiers: [], start: 728, length: 1 }, // e
            { type: 'function', modifiers: [], start: 732, length: 5 }, // ufun1
        ]);
    });

    test('descriptors', () => {
        const result = semanticTokenizeSampleFile('descriptors.py');
        expect(result).toStrictEqual([
            // from typing import Callable, Concatenate
            { type: 'namespace', modifiers: [], start: 5, length: 6 },
            { type: 'class', modifiers: [], start: 19, length: 8 },
            { type: 'class', modifiers: [], start: 29, length: 11 },
            // class DecFun[T, **P, R]:
            { type: 'class', modifiers: ['declaration'], start: 49, length: 6 },
            { type: 'typeParameter', modifiers: [], start: 56, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 61, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 64, length: 1 },
            // def __init__(self, fn: Callable[Concatenate[T, P], R]) -> None:
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 76, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 85, length: 4 },
            { type: 'function', modifiers: ['declaration', 'parameter'], start: 91, length: 2 },
            { type: 'class', modifiers: [], start: 95, length: 8 },
            { type: 'class', modifiers: [], start: 104, length: 11 },
            { type: 'typeParameter', modifiers: [], start: 116, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 119, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 123, length: 1 },
            // self.fn = fn
            { type: 'selfParameter', modifiers: ['parameter'], start: 144, length: 4 },
            { type: 'function', modifiers: ['classMember'], start: 149, length: 2 },
            { type: 'function', modifiers: ['parameter'], start: 154, length: 2 },
            // def __get__(self, instance: T, owner: type[T]) -> Callable[P, R]:
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 166, length: 7 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 174, length: 4 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 180, length: 8 },
            { type: 'typeParameter', modifiers: [], start: 190, length: 1 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 193, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 200, length: 4 },
            { type: 'typeParameter', modifiers: [], start: 205, length: 1 },
            { type: 'class', modifiers: [], start: 212, length: 8 },
            { type: 'typeParameter', modifiers: [], start: 221, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 224, length: 1 },
            // def fun(*args: P.args, **kwargs: P.kwargs) -> R:
            { type: 'function', modifiers: ['declaration'], start: 240, length: 3 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 245, length: 4 },
            { type: 'typeParameter', modifiers: [], start: 251, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 253, length: 4 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 261, length: 6 },
            { type: 'typeParameter', modifiers: [], start: 269, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 271, length: 6 },
            { type: 'typeParameter', modifiers: [], start: 282, length: 1 },
            // return self.fn(instance, *args, **kwargs)
            { type: 'selfParameter', modifiers: ['parameter'], start: 304, length: 4 },
            { type: 'function', modifiers: ['classMember'], start: 309, length: 2 },
            { type: 'parameter', modifiers: ['parameter'], start: 312, length: 8 },
            { type: 'parameter', modifiers: ['parameter'], start: 323, length: 4 },
            { type: 'parameter', modifiers: ['parameter'], start: 331, length: 6 },
            // return fun
            { type: 'function', modifiers: [], start: 355, length: 3 },
            // class DecType[T, **P, R]:
            { type: 'class', modifiers: ['declaration'], start: 367, length: 7 },
            { type: 'typeParameter', modifiers: [], start: 375, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 380, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 383, length: 1 },
            // def __init__(self, fn: Callable[Concatenate[T, P], R]) -> None:
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 395, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 404, length: 4 },
            { type: 'function', modifiers: ['declaration', 'parameter'], start: 410, length: 2 },
            { type: 'class', modifiers: [], start: 414, length: 8 },
            { type: 'class', modifiers: [], start: 423, length: 11 },
            { type: 'typeParameter', modifiers: [], start: 435, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 438, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 442, length: 1 },
            // self.fn = fn
            { type: 'selfParameter', modifiers: ['parameter'], start: 463, length: 4 },
            { type: 'function', modifiers: ['classMember'], start: 468, length: 2 },
            { type: 'function', modifiers: ['parameter'], start: 473, length: 2 },
            // def __get__(self, instance: T, owner: type[T]) -> type[T]:
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 485, length: 7 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 493, length: 4 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 499, length: 8 },
            { type: 'typeParameter', modifiers: [], start: 509, length: 1 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 512, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 519, length: 4 },
            { type: 'typeParameter', modifiers: [], start: 524, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 531, length: 4 },
            { type: 'typeParameter', modifiers: [], start: 536, length: 1 },
            // return owner
            { type: 'parameter', modifiers: ['parameter'], start: 555, length: 5 },
            // class DecSet[T, **P, R]:
            { type: 'class', modifiers: ['declaration'], start: 569, length: 6 },
            { type: 'typeParameter', modifiers: [], start: 576, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 581, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 584, length: 1 },
            // def __init__(self, fn: Callable[Concatenate[T, P], R]) -> None:
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 596, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 605, length: 4 },
            { type: 'function', modifiers: ['declaration', 'parameter'], start: 611, length: 2 },
            { type: 'class', modifiers: [], start: 615, length: 8 },
            { type: 'class', modifiers: [], start: 624, length: 11 },
            { type: 'typeParameter', modifiers: [], start: 636, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 639, length: 1 },
            { type: 'typeParameter', modifiers: [], start: 643, length: 1 },
            // self.fn = fn
            { type: 'selfParameter', modifiers: ['parameter'], start: 664, length: 4 },
            { type: 'function', modifiers: ['classMember'], start: 669, length: 2 },
            { type: 'function', modifiers: ['parameter'], start: 674, length: 2 },
            // def __get__(self, instance: T, owner: type[T]):
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 686, length: 7 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 694, length: 4 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 700, length: 8 },
            { type: 'typeParameter', modifiers: [], start: 710, length: 1 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 713, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 720, length: 4 },
            { type: 'typeParameter', modifiers: [], start: 725, length: 1 },
            // return self.__get__
            { type: 'selfParameter', modifiers: ['parameter'], start: 745, length: 4 },
            { type: 'method', modifiers: ['classMember'], start: 750, length: 7 },
            // def __set__(self, instance: T, value: int):
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 767, length: 7 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 775, length: 4 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 781, length: 8 },
            { type: 'typeParameter', modifiers: [], start: 791, length: 1 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 794, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 801, length: 3 },
            // class Bar:
            { type: 'class', modifiers: ['declaration'], start: 828, length: 3 },
            // @DecFun def desc0(self): ...
            { type: 'function', modifiers: ['declaration', 'classMember', 'readonly'], start: 853, length: 5 },
            { type: 'decorator', modifiers: [], start: 837, length: 1 },
            { type: 'decorator', modifiers: [], start: 838, length: 6 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 859, length: 4 },
            // @property def desc1(self) -> int: return 1
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 893, length: 5 },
            { type: 'decorator', modifiers: [], start: 875, length: 1 },
            { type: 'decorator', modifiers: [], start: 876, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 899, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 908, length: 3 },
            // @desc1.setter def desc1(self, value: Callable[[], int]): _ = value()
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 957, length: 5 },
            { type: 'decorator', modifiers: [], start: 935, length: 1 },
            { type: 'property', modifiers: ['classMember'], start: 936, length: 5 },
            { type: 'method', modifiers: ['classMember'], start: 942, length: 6 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 963, length: 4 },
            { type: 'function', modifiers: ['declaration', 'parameter'], start: 969, length: 5 },
            { type: 'class', modifiers: [], start: 976, length: 8 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 989, length: 3 },
            { type: 'variable', modifiers: [], start: 1004, length: 1 },
            { type: 'function', modifiers: ['parameter'], start: 1008, length: 5 },
            // @DecType def desc2(self): ...
            { type: 'class', modifiers: ['declaration', 'classMember', 'readonly'], start: 1038, length: 5 },
            { type: 'decorator', modifiers: [], start: 1021, length: 1 },
            { type: 'decorator', modifiers: [], start: 1022, length: 7 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 1044, length: 4 },
            // @DecSet def desc3(self): ...
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 1076, length: 5 },
            { type: 'decorator', modifiers: [], start: 1060, length: 1 },
            { type: 'decorator', modifiers: [], start: 1061, length: 6 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 1082, length: 4 },
            // bar = Bar()
            { type: 'variable', modifiers: [], start: 1095, length: 3 },
            { type: 'class', modifiers: [], start: 1101, length: 3 },
            // a = bar.desc0
            { type: 'function', modifiers: [], start: 1107, length: 1 },
            { type: 'variable', modifiers: [], start: 1111, length: 3 },
            { type: 'function', modifiers: ['classMember', 'readonly'], start: 1115, length: 5 },
            // a()
            { type: 'function', modifiers: [], start: 1121, length: 1 },
            // b = bar.desc1
            { type: 'variable', modifiers: [], start: 1125, length: 1 },
            { type: 'variable', modifiers: [], start: 1129, length: 3 },
            { type: 'property', modifiers: ['classMember'], start: 1133, length: 5 },
            // bar.desc1 = lambda: 1
            { type: 'variable', modifiers: [], start: 1139, length: 3 },
            { type: 'function', modifiers: ['classMember'], start: 1143, length: 5 },
            // c = bar.desc2
            { type: 'class', modifiers: [], start: 1161, length: 1 },
            { type: 'variable', modifiers: [], start: 1165, length: 3 },
            { type: 'class', modifiers: ['classMember', 'readonly'], start: 1169, length: 5 },
            // d = bar.desc3
            { type: 'function', modifiers: [], start: 1175, length: 1 },
            { type: 'variable', modifiers: [], start: 1179, length: 3 },
            { type: 'method', modifiers: ['classMember'], start: 1183, length: 5 },
            // bar.desc3 = 1
            { type: 'variable', modifiers: [], start: 1189, length: 3 },
            { type: 'property', modifiers: ['classMember'], start: 1193, length: 5 },
        ]);
    });

    test('descriptors_extended', () => {
        const result = semanticTokenizeSampleFile('descriptors_extended.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
            { type: 'class', modifiers: [], start: 19, length: 8 }, // Callable
            { type: 'class', modifiers: [], start: 29, length: 11 }, // Concatenate
            { type: 'class', modifiers: ['declaration'], start: 49, length: 1 }, // A
            { type: 'typeParameter', modifiers: [], start: 51, length: 1 }, // T
            { type: 'typeParameter', modifiers: [], start: 54, length: 1 }, // U
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 66, length: 8 }, // __init__
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 75, length: 4 }, // self
            { type: 'function', modifiers: ['declaration', 'parameter'], start: 81, length: 4 }, // func
            { type: 'class', modifiers: [], start: 87, length: 8 }, // Callable
            { type: 'typeParameter', modifiers: [], start: 97, length: 1 }, // T
            { type: 'typeParameter', modifiers: [], start: 101, length: 1 }, // U
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 126, length: 7 }, // __get__
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 134, length: 4 }, // self
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 140, length: 8 }, // instance
            { type: 'typeParameter', modifiers: [], start: 150, length: 1 }, // T
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 153, length: 5 }, // owner
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 160, length: 4 }, // type
            { type: 'typeParameter', modifiers: [], start: 165, length: 1 }, // T
            { type: 'typeParameter', modifiers: [], start: 186, length: 1 }, // U
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 201, length: 7 }, // __set__
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 209, length: 4 }, // self
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 215, length: 8 }, // instance
            { type: 'typeParameter', modifiers: [], start: 225, length: 1 }, // T
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 228, length: 5 }, // value
            { type: 'typeParameter', modifiers: [], start: 235, length: 1 }, // U
            { type: 'class', modifiers: ['declaration'], start: 259, length: 1 }, // B
            { type: 'typeParameter', modifiers: [], start: 261, length: 1 }, // T
            { type: 'typeParameter', modifiers: [], start: 264, length: 1 }, // U
            { type: 'class', modifiers: [], start: 267, length: 1 }, // A
            { type: 'typeParameter', modifiers: [], start: 269, length: 1 }, // T
            { type: 'typeParameter', modifiers: [], start: 272, length: 1 }, // U
            { type: 'function', modifiers: ['declaration'], start: 287, length: 4 }, // deco
            { type: 'typeParameter', modifiers: [], start: 292, length: 1 }, // T
            { type: 'typeParameter', modifiers: [], start: 297, length: 1 }, // P
            { type: 'typeParameter', modifiers: [], start: 300, length: 1 }, // R
            { type: 'function', modifiers: ['declaration', 'parameter'], start: 308, length: 2 }, // fn
            { type: 'class', modifiers: [], start: 312, length: 8 }, // Callable
            { type: 'class', modifiers: [], start: 321, length: 11 }, // Concatenate
            { type: 'typeParameter', modifiers: [], start: 333, length: 1 }, // T
            { type: 'typeParameter', modifiers: [], start: 336, length: 1 }, // P
            { type: 'typeParameter', modifiers: [], start: 340, length: 1 }, // R
            { type: 'class', modifiers: [], start: 349, length: 8 }, // Callable
            { type: 'class', modifiers: [], start: 358, length: 11 }, // Concatenate
            { type: 'typeParameter', modifiers: [], start: 370, length: 1 }, // T
            { type: 'typeParameter', modifiers: [], start: 373, length: 1 }, // P
            { type: 'typeParameter', modifiers: [], start: 377, length: 1 }, // R
            { type: 'class', modifiers: ['declaration'], start: 393, length: 3 }, // Foo
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 413, length: 3 }, // foo
            { type: 'decorator', modifiers: [], start: 402, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 403, length: 1 }, // A
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 417, length: 4 }, // self
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 426, length: 3 }, // int
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 451, length: 3 }, // bar
            { type: 'decorator', modifiers: [], start: 440, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 441, length: 1 }, // B
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 455, length: 4 }, // self
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 464, length: 3 }, // int
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 496, length: 3 }, // bat
            { type: 'decorator', modifiers: [], start: 478, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 479, length: 8 }, // property
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 500, length: 4 }, // self
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 509, length: 3 }, // int
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 542, length: 3 }, // bat
            { type: 'decorator', modifiers: [], start: 522, length: 1 }, // @
            { type: 'property', modifiers: ['classMember'], start: 523, length: 3 }, // bat
            { type: 'method', modifiers: ['classMember'], start: 527, length: 6 }, // setter
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 546, length: 4 }, // self
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 552, length: 5 }, // value
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 559, length: 3 }, // int
            { type: 'property', modifiers: ['declaration', 'classMember', 'readonly'], start: 600, length: 3 }, // baz
            { type: 'decorator', modifiers: [], start: 582, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 583, length: 8 }, // property
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 604, length: 4 }, // self
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 613, length: 3 }, // int
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 655, length: 3 }, // cat
            { type: 'decorator', modifiers: [], start: 627, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 628, length: 8 }, // property
            { type: 'decorator', modifiers: [], start: 641, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 642, length: 4 }, // deco
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 659, length: 4 }, // self
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 668, length: 3 }, // int
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 711, length: 3 }, // cat
            { type: 'decorator', modifiers: [], start: 681, length: 1 }, // @
            { type: 'property', modifiers: ['classMember'], start: 682, length: 3 }, // cat
            { type: 'method', modifiers: ['classMember'], start: 686, length: 6 }, // setter
            { type: 'decorator', modifiers: [], start: 697, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 698, length: 4 }, // deco
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 715, length: 4 }, // self
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 721, length: 5 }, // value
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 728, length: 3 }, // int
            { type: 'variable', modifiers: [], start: 740, length: 3 }, // foo
            { type: 'class', modifiers: [], start: 746, length: 3 }, // Foo
            { type: 'variable', modifiers: [], start: 753, length: 3 }, // foo
            { type: 'property', modifiers: ['classMember'], start: 757, length: 3 }, // foo
            { type: 'variable', modifiers: [], start: 761, length: 3 }, // foo
            { type: 'property', modifiers: ['classMember'], start: 765, length: 3 }, // bar
            { type: 'variable', modifiers: [], start: 769, length: 3 }, // foo
            { type: 'property', modifiers: ['classMember'], start: 773, length: 3 }, // bat
            { type: 'variable', modifiers: [], start: 777, length: 3 }, // foo
            { type: 'property', modifiers: ['classMember'], start: 781, length: 3 }, // bat
            { type: 'variable', modifiers: [], start: 789, length: 3 }, // foo
            { type: 'property', modifiers: ['classMember', 'readonly'], start: 793, length: 3 }, // baz
            { type: 'variable', modifiers: [], start: 797, length: 3 }, // foo
            { type: 'property', modifiers: ['classMember'], start: 801, length: 3 }, // cat
            { type: 'variable', modifiers: [], start: 805, length: 3 }, // foo
            { type: 'property', modifiers: ['classMember'], start: 809, length: 3 }, // cat
        ]);
    });

    test('enum', () => {
        const result = semanticTokenizeSampleFile('enum.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 4 },
            { type: 'enum', modifiers: [], start: 17, length: 7 },
            { type: 'enum', modifiers: ['declaration'], start: 33, length: 11 },
            { type: 'enum', modifiers: [], start: 45, length: 7 },
            { type: 'enumMember', modifiers: [], start: 59, length: 3 },
            { type: 'enumMember', modifiers: [], start: 71, length: 2 },
            { type: 'variable', modifiers: [], start: 79, length: 1 },
            { type: 'enum', modifiers: [], start: 83, length: 11 },
            { type: 'enumMember', modifiers: [], start: 95, length: 3 },
        ]);
    });

    test('type annotation', () => {
        const result = semanticTokenizeSampleFile('type_annotation.py');
        expect(result).toStrictEqual([
            { type: 'variable', modifiers: [], start: 0, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 3, length: 3 },
            { type: 'variable', modifiers: [], start: 7, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 10, length: 3 },
        ]);
    });

    test('type variables', () => {
        const result = semanticTokenizeSampleFile('type_var.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
            { type: 'class', modifiers: [], start: 19, length: 7 }, // TypeVar
            { type: 'function', modifiers: ['declaration'], start: 33, length: 3 }, // foo
            { type: 'typeParameter', modifiers: [], start: 37, length: 1 }, // T
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 40, length: 5 }, // value
            { type: 'typeParameter', modifiers: [], start: 47, length: 1 }, // T
            { type: 'variable', modifiers: [], start: 55, length: 4 }, // _bar
            { type: 'typeParameter', modifiers: [], start: 61, length: 1 }, // T
            { type: 'parameter', modifiers: ['parameter'], start: 65, length: 5 }, // value
            { type: 'typeParameter', modifiers: ['readonly'], start: 73, length: 2 }, // _T
            { type: 'class', modifiers: [], start: 78, length: 7 }, // TypeVar
            { type: 'function', modifiers: ['declaration'], start: 98, length: 4 }, // fooo
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 103, length: 5 }, // value
            { type: 'typeParameter', modifiers: ['readonly'], start: 110, length: 2 }, // _T
            { type: 'typeParameter', modifiers: ['readonly'], start: 117, length: 2 }, // _T
            { type: 'variable', modifiers: [], start: 125, length: 4 }, // _bar
            { type: 'typeParameter', modifiers: ['readonly'], start: 131, length: 2 }, // _T
            { type: 'parameter', modifiers: ['parameter'], start: 136, length: 5 }, // value
            { type: 'variable', modifiers: [], start: 153, length: 4 }, // _bar
        ]);
    });

    test('imports', () => {
        const result = semanticTokenizeSampleFile('imports.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 7, length: 4 }, // json
            { type: 'namespace', modifiers: [], start: 19, length: 4 }, // json
            { type: 'namespace', modifiers: [], start: 27, length: 4 }, // JSON
            { type: 'namespace', modifiers: [], start: 39, length: 2 }, // os
            { type: 'namespace', modifiers: [], start: 42, length: 4 }, // path
            { type: 'namespace', modifiers: [], start: 50, length: 2 }, // p1
            { type: 'namespace', modifiers: [], start: 58, length: 2 }, // os
            { type: 'namespace', modifiers: [], start: 68, length: 4 }, // path
            { type: 'namespace', modifiers: [], start: 76, length: 2 }, // p2
            { type: 'namespace', modifiers: [], start: 84, length: 2 }, // re
            { type: 'function', modifiers: [], start: 94, length: 5 }, // match
            { type: 'function', modifiers: [], start: 101, length: 6 }, // search
            { type: 'function', modifiers: [], start: 111, length: 1 }, // s
            { type: 'variable', modifiers: ['readonly'], start: 114, length: 10 }, // IGNORECASE
            { type: 'namespace', modifiers: [], start: 130, length: 6 }, // typing
            { type: 'type', modifiers: [], start: 144, length: 5 }, // Never
            { type: 'class', modifiers: [], start: 151, length: 8 }, // Iterable
            { type: 'class', modifiers: [], start: 163, length: 3 }, // Foo
            { type: 'namespace', modifiers: [], start: 172, length: 11 }, // collections
            { type: 'namespace', modifiers: [], start: 184, length: 3 }, // abc
            { type: 'class', modifiers: [], start: 195, length: 8 }, // Iterator
        ]);
    });

    test('final', () => {
        const result = semanticTokenizeSampleFile('final.py');
        expect(result).toStrictEqual([
            // imports
            { type: 'namespace', modifiers: [], start: 5, length: 4 },
            { type: 'variable', modifiers: ['readonly'], start: 17, length: 2 },
            { type: 'namespace', modifiers: [], start: 25, length: 6 },
            { type: 'class', modifiers: [], start: 39, length: 5 },
            { type: 'function', modifiers: [], start: 46, length: 8 },
            // variable definitions
            { type: 'variable', modifiers: ['readonly'], start: 56, length: 3 },
            { type: 'variable', modifiers: ['readonly'], start: 64, length: 3 },
            { type: 'class', modifiers: [], start: 69, length: 5 },
            { type: 'variable', modifiers: [], start: 79, length: 1 },
            { type: 'variable', modifiers: ['readonly'], start: 85, length: 2 },
            { type: 'class', modifiers: [], start: 89, length: 5 },
            // Foo
            { type: 'class', modifiers: ['declaration'], start: 107, length: 3 },
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 120, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 129, length: 4 },
            { type: 'selfParameter', modifiers: ['parameter'], start: 144, length: 4 },
            { type: 'property', modifiers: ['readonly', 'classMember'], start: 149, length: 8 },
            { type: 'class', modifiers: [], start: 159, length: 5 },
            { type: 'property', modifiers: ['declaration', 'classMember', 'readonly'], start: 193, length: 3 },
            { type: 'decorator', modifiers: [], start: 175, length: 1 },
            { type: 'decorator', modifiers: [], start: 176, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 197, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 206, length: 3 },
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 238, length: 3 },
            { type: 'decorator', modifiers: [], start: 220, length: 1 },
            { type: 'decorator', modifiers: [], start: 221, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 242, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 251, length: 3 },
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 284, length: 3 },
            { type: 'decorator', modifiers: [], start: 264, length: 1 },
            { type: 'property', modifiers: ['classMember'], start: 265, length: 3 },
            { type: 'method', modifiers: ['classMember'], start: 269, length: 6 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 288, length: 4 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 294, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 301, length: 3 },
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 320, length: 11 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 332, length: 4 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 338, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 344, length: 3 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 352, length: 5 },
            { type: 'variable', modifiers: ['readonly'], start: 374, length: 2 },
            // Bar
            { type: 'class', modifiers: ['declaration'], start: 385, length: 3 },
            { type: 'property', modifiers: ['readonly', 'classMember', 'static'], start: 394, length: 3 },
            { type: 'class', modifiers: [], start: 399, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 405, length: 3 },
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 425, length: 11 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 437, length: 4 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 443, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 449, length: 3 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 457, length: 3 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 477, length: 3 },
            { type: 'parameter', modifiers: ['parameter'], start: 481, length: 4 },
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 510, length: 11 },
            { type: 'decorator', modifiers: [], start: 492, length: 1 },
            { type: 'decorator', modifiers: [], start: 493, length: 8 },
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 522, length: 4 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 528, length: 4 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 534, length: 3 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 539, length: 5 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 546, length: 3 },
            // Foo().foo
            { type: 'class', modifiers: [], start: 567, length: 3 },
            { type: 'property', modifiers: ['classMember', 'readonly'], start: 573, length: 3 },
            // Foo().bar
            { type: 'class', modifiers: [], start: 577, length: 3 },
            { type: 'property', modifiers: ['classMember'], start: 583, length: 3 },
            // baz = Foo()
            { type: 'variable', modifiers: [], start: 588, length: 3 },
            { type: 'class', modifiers: [], start: 594, length: 3 },
            // _ = baz.foo
            { type: 'variable', modifiers: [], start: 600, length: 1 },
            { type: 'variable', modifiers: [], start: 604, length: 3 },
            { type: 'property', modifiers: ['classMember', 'readonly'], start: 608, length: 3 },
            // meaning = baz.constant
            { type: 'variable', modifiers: [], start: 612, length: 7 },
            { type: 'variable', modifiers: [], start: 622, length: 3 },
            { type: 'property', modifiers: ['readonly', 'classMember'], start: 626, length: 8 },
            // bam = baz.pi + Bar.fir
            { type: 'variable', modifiers: [], start: 635, length: 3 },
            { type: 'variable', modifiers: [], start: 641, length: 3 },
            { type: 'property', modifiers: ['readonly', 'classMember'], start: 645, length: 2 },
            { type: 'class', modifiers: [], start: 650, length: 3 },
            { type: 'property', modifiers: ['readonly', 'classMember', 'static'], start: 654, length: 3 },
            // bar = Bar().beef
            { type: 'variable', modifiers: [], start: 658, length: 3 },
            { type: 'class', modifiers: [], start: 664, length: 3 },
            { type: 'property', modifiers: ['classMember'], start: 670, length: 4 },
        ]);
    });

    test('never', () => {
        const result = semanticTokenizeSampleFile('never.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
            { type: 'type', modifiers: [], start: 19, length: 5 }, // Never
            { type: 'variable', modifiers: [], start: 26, length: 3 }, // foo
            { type: 'type', modifiers: [], start: 31, length: 5 }, // Never
            { type: 'type', modifiers: [], start: 37, length: 3 }, // bar
            { type: 'type', modifiers: [], start: 43, length: 5 }, // Never
            { type: 'function', modifiers: ['declaration'], start: 54, length: 3 }, // baz
            { type: 'type', modifiers: [], start: 63, length: 5 }, // Never
            { type: 'function', modifiers: ['declaration'], start: 83, length: 4 }, // asdf
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 88, length: 3 }, // foo
            { type: 'type', modifiers: [], start: 93, length: 5 }, // Never
            { type: 'variable', modifiers: [], start: 105, length: 5 }, // value
            { type: 'type', modifiers: [], start: 112, length: 5 }, // Never
            { type: 'parameter', modifiers: ['parameter'], start: 120, length: 3 }, // foo
            { type: 'variable', modifiers: [], start: 128, length: 5 }, // value
            { type: 'type', modifiers: [], start: 135, length: 4 }, // Type
            { type: 'type', modifiers: [], start: 142, length: 5 }, // Never
            { type: 'variable', modifiers: [], start: 148, length: 5 }, // value
            { type: 'type', modifiers: [], start: 155, length: 4 }, // Type
            { type: 'function', modifiers: ['declaration'], start: 169, length: 8 }, // inferred
            { type: 'variable', modifiers: [], start: 185, length: 5 }, // value
            { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 207, length: 10 }, // isinstance
            { type: 'variable', modifiers: [], start: 218, length: 5 }, // value
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 225, length: 3 }, // str
            { type: 'variable', modifiers: [], start: 239, length: 5 }, // value
            { type: 'variable', modifiers: [], start: 254, length: 6 }, // value2
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 262, length: 3 }, // str
            { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 282, length: 10 }, // isinstance
            { type: 'variable', modifiers: [], start: 293, length: 6 }, // value2
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 301, length: 3 }, // str
            { type: 'variable', modifiers: [], start: 315, length: 6 }, // value2
            { type: 'keyword', modifiers: [], start: 323, length: 4 }, // type
            { type: 'type', modifiers: [], start: 328, length: 3 }, // Baz
            { type: 'type', modifiers: [], start: 334, length: 5 }, // Never
            { type: 'variable', modifiers: [], start: 340, length: 3 }, // bat
            { type: 'type', modifiers: [], start: 345, length: 3 }, // Baz
        ]);
    });

    test('functions', () => {
        const result = semanticTokenizeSampleFile('functions.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 },
            { type: 'class', modifiers: [], start: 19, length: 8 },
            { type: 'function', modifiers: ['declaration'], start: 34, length: 3 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 38, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 41, length: 3 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 47, length: 1 },
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 52, length: 1 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 58, length: 3 },
            { type: 'function', modifiers: [], start: 72, length: 3 },
            { type: 'type', modifiers: [], start: 79, length: 3 },
            { type: 'class', modifiers: [], start: 85, length: 8 },
            { type: 'function', modifiers: [], start: 105, length: 3 },
            { type: 'class', modifiers: [], start: 110, length: 8 },
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 120, length: 3 },
        ]);
    });
    test('undefined', () => {
        const result = semanticTokenizeSampleFile('undefined.py');
        expect(result).toStrictEqual([]);
    });
    test('type_aliases', () => {
        const result = semanticTokenizeSampleFile('type_aliases.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
            { type: 'class', modifiers: [], start: 19, length: 9 }, // TypeAlias
            { type: 'class', modifiers: [], start: 30, length: 3 }, // Foo
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 36, length: 3 }, // int
            { type: 'class', modifiers: [], start: 40, length: 3 }, // Bar
            { type: 'class', modifiers: [], start: 45, length: 9 }, // TypeAlias
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 57, length: 3 }, // int
            { type: 'keyword', modifiers: [], start: 61, length: 4 }, // type
            { type: 'class', modifiers: [], start: 66, length: 3 }, // Baz
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 72, length: 3 }, // int
        ]);
    });

    test('decorators', () => {
        const result = semanticTokenizeSampleFile('decorators.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 7, length: 11 }, // dataclasses
            { type: 'namespace', modifiers: [], start: 26, length: 9 }, // functools
            { type: 'namespace', modifiers: [], start: 41, length: 11 }, // dataclasses
            { type: 'function', modifiers: [], start: 60, length: 9 }, // dataclasses
            { type: 'namespace', modifiers: [], start: 75, length: 6 }, // typing
            { type: 'function', modifiers: [], start: 89, length: 5 }, // final

            { type: 'class', modifiers: ['declaration'], start: 116, length: 1 }, // A
            { type: 'decorator', modifiers: [], start: 97, length: 1 }, // @
            { type: 'function', modifiers: [], start: 98, length: 9 }, // dataclass

            { type: 'class', modifiers: ['declaration'], start: 155, length: 1 }, // B
            { type: 'decorator', modifiers: [], start: 124, length: 1 }, // @
            { type: 'namespace', modifiers: [], start: 125, length: 11 }, // dataclasses
            { type: 'function', modifiers: [], start: 137, length: 9 }, // dataclass
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 177, length: 6 }, // method
            { type: 'decorator', modifiers: [], start: 162, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 163, length: 5 }, // final
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 184, length: 4 }, // self
            { type: 'method', modifiers: ['declaration', 'static', 'classMember'], start: 221, length: 6 }, // static
            { type: 'decorator', modifiers: [], start: 199, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 200, length: 12 }, // staticmethod

            { type: 'function', modifiers: ['declaration'], start: 257, length: 6 }, // cached
            { type: 'decorator', modifiers: [], start: 236, length: 1 }, // @
            { type: 'namespace', modifiers: [], start: 237, length: 9 }, // functools
            { type: 'function', modifiers: [], start: 247, length: 5 }, // cache
            { type: 'class', modifiers: [], start: 272, length: 1 }, // B
            { type: 'method', modifiers: ['static', 'classMember'], start: 274, length: 6 }, // static
        ]);
    });

    test('parameters', () => {
        const result = semanticTokenizeSampleFile('parameters.py');
        expect(result).toStrictEqual([
            // method
            { type: 'class', modifiers: ['declaration'], start: 6, length: 1 }, // C
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 17, length: 8 }, // __init__
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 26, length: 4 }, // self
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 32, length: 1 }, // x
            { type: 'selfParameter', modifiers: ['parameter'], start: 44, length: 4 }, // self
            { type: 'property', modifiers: ['classMember'], start: 49, length: 1 }, // x
            { type: 'parameter', modifiers: ['parameter'], start: 53, length: 1 }, // x
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 81, length: 1 }, // m
            { type: 'decorator', modifiers: [], start: 60, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 61, length: 11 }, // classmethod
            { type: 'clsParameter', modifiers: ['declaration', 'parameter'], start: 83, length: 3 }, // cls
            { type: 'clsParameter', modifiers: ['parameter'], start: 104, length: 3 }, // cls
            // function
            { type: 'function', modifiers: ['declaration'], start: 116, length: 1 }, // f
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 118, length: 1 }, // x
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 121, length: 1 }, // y
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 124, length: 3 }, // int
            { type: 'function', modifiers: ['declaration'], start: 138, length: 1 }, // g
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 140, length: 1 }, // x
            { type: 'parameter', modifiers: ['parameter'], start: 159, length: 1 }, // x
            { type: 'parameter', modifiers: ['parameter'], start: 163, length: 1 }, // y
            { type: 'variable', modifiers: [], start: 169, length: 1 }, // z
            { type: 'parameter', modifiers: ['parameter'], start: 177, length: 1 }, // x
            { type: 'function', modifiers: [], start: 190, length: 1 }, // g
            { type: 'variable', modifiers: [], start: 192, length: 1 }, // z
            // lambda
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 203, length: 1 }, // a
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 206, length: 1 }, // b
            { type: 'parameter', modifiers: ['parameter'], start: 209, length: 1 }, // a
            { type: 'parameter', modifiers: ['parameter'], start: 213, length: 1 }, // b
        ]);
    });

    test('Unknown and Any', () => {
        const result = semanticTokenizeSampleFile('unknown.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
            { type: 'type', modifiers: [], start: 19, length: 3 }, // Any
            { type: 'class', modifiers: [], start: 24, length: 9 }, // TypeAlias
            { type: 'function', modifiers: ['declaration'], start: 39, length: 1 }, // f
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 41, length: 1 }, // l
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 44, length: 4 }, // list
            { type: 'type', modifiers: [], start: 53, length: 3 }, // Any
            { type: 'variable', modifiers: [], start: 62, length: 1 }, // v
            { type: 'parameter', modifiers: ['parameter'], start: 66, length: 1 }, // l
            { type: 'variable', modifiers: [], start: 82, length: 1 }, // v
            { type: 'function', modifiers: ['declaration'], start: 90, length: 2 }, // f1
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 93, length: 1 }, // a
            { type: 'parameter', modifiers: ['parameter'], start: 101, length: 1 }, // a
            { type: 'parameter', modifiers: ['parameter'], start: 105, length: 1 }, // a
            // `T` and `maximum` should be ignored
            { type: 'function', modifiers: ['declaration'], start: 125, length: 2 }, // f2
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 128, length: 1 }, // b
            { type: 'type', modifiers: [], start: 131, length: 3 }, // Any
            { type: 'type', modifiers: [], start: 139, length: 3 }, // Any
            { type: 'parameter', modifiers: ['parameter'], start: 155, length: 1 }, // b
            // `as_integer_ratio`, `g`, and `foo` should be ignored
            { type: 'variable', modifiers: [], start: 185, length: 3 }, // bar
            { type: 'function', modifiers: [], start: 191, length: 1 }, // f
            { type: 'variable', modifiers: [], start: 199, length: 1 }, // a
            { type: 'variable', modifiers: [], start: 202, length: 1 }, // b
            { type: 'function', modifiers: [], start: 206, length: 2 }, // f2
            { type: 'variable', modifiers: [], start: 213, length: 1 }, // c
            { type: 'variable', modifiers: [], start: 217, length: 1 }, // a
            // `bit_length` should be ignored
            { type: 'variable', modifiers: [], start: 234, length: 1 }, // b
            // `bit_length` should be ignored
            { type: 'type', modifiers: [], start: 250, length: 3 }, // Foo
            { type: 'type', modifiers: [], start: 256, length: 3 }, // Any
            { type: 'type', modifiers: [], start: 260, length: 3 }, // Bar
            { type: 'class', modifiers: [], start: 265, length: 9 }, // TypeAlias
            { type: 'type', modifiers: [], start: 277, length: 3 }, // Any
            { type: 'keyword', modifiers: [], start: 281, length: 4 }, // type
            { type: 'type', modifiers: [], start: 286, length: 3 }, // Baz
            { type: 'type', modifiers: [], start: 292, length: 3 }, // Any
        ]);
    });

    test('Unknown, Any, and Union', () => {
        const result = semanticTokenizeSampleFile('unknown_any_union.py');
        expect(result).toStrictEqual([
            { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
            { type: 'type', modifiers: [], start: 19, length: 3 }, // Any
            { type: 'class', modifiers: [], start: 24, length: 8 }, // Callable
            { type: 'class', modifiers: ['declaration'], start: 41, length: 1 }, // A
            { type: 'method', modifiers: ['declaration', 'classMember'], start: 52, length: 8 }, // __init__
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 61, length: 4 }, // self
            { type: 'selfParameter', modifiers: ['parameter'], start: 76, length: 4 }, // self
            { type: 'property', modifiers: ['classMember'], start: 81, length: 5 }, // _prop
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 118, length: 4 }, // prop
            { type: 'decorator', modifiers: [], start: 100, length: 1 }, // @
            { type: 'decorator', modifiers: [], start: 101, length: 8 }, // property
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 123, length: 4 }, // self
            { type: 'selfParameter', modifiers: ['parameter'], start: 145, length: 4 }, // self
            { type: 'property', modifiers: ['classMember'], start: 150, length: 5 }, // _prop
            { type: 'property', modifiers: ['declaration', 'classMember'], start: 182, length: 4 }, // prop
            { type: 'decorator', modifiers: [], start: 161, length: 1 }, // @
            { type: 'property', modifiers: ['classMember'], start: 162, length: 4 }, // prop
            { type: 'method', modifiers: ['classMember'], start: 167, length: 6 }, // setter
            { type: 'selfParameter', modifiers: ['declaration', 'parameter'], start: 187, length: 4 }, // self
            { type: 'parameter', modifiers: ['declaration', 'parameter'], start: 193, length: 5 }, // value
            { type: 'selfParameter', modifiers: ['parameter'], start: 209, length: 4 }, // self
            { type: 'variable', modifiers: [], start: 214, length: 5 }, // _prop
            { type: 'parameter', modifiers: ['parameter'], start: 222, length: 5 }, // value
            { type: 'variable', modifiers: [], start: 230, length: 1 }, // a
            { type: 'class', modifiers: [], start: 234, length: 1 }, // A
            { type: 'variable', modifiers: [], start: 238, length: 2 }, // ap
            { type: 'variable', modifiers: [], start: 243, length: 1 }, // a
            { type: 'property', modifiers: ['classMember'], start: 245, length: 4 }, // prop
            { type: 'variable', modifiers: [], start: 250, length: 1 }, // a
            { type: 'property', modifiers: ['classMember'], start: 252, length: 4 }, // prop
            { type: 'type', modifiers: [], start: 265, length: 8 }, // test_any
            { type: 'type', modifiers: [], start: 276, length: 3 }, // Any
            { type: 'variable', modifiers: [], start: 280, length: 3 }, // foo
            { type: 'type', modifiers: [], start: 285, length: 8 }, // test_any
            { type: 'variable', modifiers: [], start: 298, length: 4 }, // test
            { type: 'type', modifiers: [], start: 304, length: 3 }, // Any
            { type: 'variable', modifiers: [], start: 312, length: 10 }, // not_a_type
            { type: 'variable', modifiers: [], start: 325, length: 4 }, // test
            { type: 'variable', modifiers: [], start: 331, length: 1 }, // b
            { type: 'class', modifiers: [], start: 334, length: 8 }, // Callable
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 355, length: 3 }, // int
            { type: 'function', modifiers: [], start: 363, length: 1 }, // c
            { type: 'class', modifiers: [], start: 366, length: 8 }, // Callable
            { type: 'class', modifiers: [], start: 387, length: 8 }, // Callable
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 397, length: 3 }, // int
            { type: 'variable', modifiers: [], start: 409, length: 1 }, // d
            { type: 'class', modifiers: [], start: 412, length: 8 }, // Callable
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 433, length: 4 }, // type
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 438, length: 3 }, // int
            { type: 'type', modifiers: [], start: 443, length: 1 }, // e
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 446, length: 4 }, // type
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 451, length: 3 }, // int
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 458, length: 4 }, // type
            { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 463, length: 5 }, // float
        ]);
    });

    describe('builtins', () => {
        test('real builtins', () => {
            const result = semanticTokenizeSampleFile('builtin_identifiers.py');
            expect(result).toStrictEqual([
                // imports
                { type: 'namespace', modifiers: [], start: 5, length: 6 }, // typing
                { type: 'class', modifiers: [], start: 19, length: 4 }, // List
                { type: 'class', modifiers: [], start: 25, length: 3 }, // Set
                { type: 'class', modifiers: [], start: 30, length: 9 }, // TypeAlias
                // type aliases
                { type: 'class', modifiers: [], start: 41, length: 3 }, // Foo
                { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 47, length: 4 }, // list
                { type: 'type', modifiers: [], start: 52, length: 3 }, // Bar
                { type: 'class', modifiers: [], start: 58, length: 4 }, // List
                { type: 'class', modifiers: [], start: 65, length: 3 }, // Set
                { type: 'class', modifiers: [], start: 69, length: 3 }, // Old
                { type: 'class', modifiers: [], start: 74, length: 9 }, // TypeAlias
                { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 86, length: 4 }, // dict
                { type: 'keyword', modifiers: [], start: 91, length: 4 }, // type
                { type: 'class', modifiers: [], start: 96, length: 3 }, // New
                { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 102, length: 5 }, // tuple
                // builtin functions
                { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 109, length: 5 }, // print
                { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 115, length: 5 }, // input
                { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 121, length: 4 }, // func
                { type: 'function', modifiers: ['defaultLibrary', 'builtin'], start: 128, length: 5 }, // print
                // builtin types/classes
                { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 135, length: 3 }, // int
                { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 139, length: 3 }, // str
                { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 143, length: 10 }, // ValueError
                { type: 'class', modifiers: ['defaultLibrary', 'builtin'], start: 154, length: 16 }, // EnvironmentError
            ]);
        });

        test('project builtins', () => {
            const resultNoBuiltins = semanticTokenizeSampleFile('project_builtins.py');
            expect(resultNoBuiltins).toStrictEqual([
                { type: 'variable', modifiers: [], start: 0, length: 1 },
                { type: 'variable', modifiers: [], start: 6, length: 1 },
                { type: 'variable', modifiers: [], start: 10, length: 1 },
                // this `some_global` is referrring to the the builtin
                { type: 'variable', modifiers: ['builtin'], start: 14, length: 11 },
                // inside scope()...
                { type: 'function', modifiers: ['declaration'], start: 31, length: 5 },
                // this `some_global` is redefined inside the function scope
                { type: 'variable', modifiers: [], start: 44, length: 11 },
                { type: 'variable', modifiers: [], start: 64, length: 1 },
                { type: 'variable', modifiers: [], start: 68, length: 1 },
                // so this `some_global` refers to the redefined one, not to the builtin
                { type: 'variable', modifiers: [], start: 72, length: 11 },
                // inside in_function()...
                { type: 'function', modifiers: ['declaration'], start: 90, length: 11 },
                { type: 'variable', modifiers: [], start: 109, length: 1 },
                { type: 'variable', modifiers: [], start: 113, length: 1 },
                // this function is similar to scope(), but we don't redefine some_global, so it refers to the builtin
                { type: 'variable', modifiers: ['builtin'], start: 117, length: 11 },
            ]);
        });
    });
} else {
    // prevent jest from failing because no tests were found
    test('windows placeholder', () => {});
}
