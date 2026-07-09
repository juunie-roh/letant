import os
import numpy as np
from .a import alpha
from .pkg import beta

if os.name == "posix":
    flag = True

def greet(name, punct="!"):
    message = name + punct
    return message

class Greeter:
    default = "hi"

    def method(self, x):
        return x

value = greet(alpha)
