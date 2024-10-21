#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <unistd.h>

// 定义 execvp 原始函数指针
static int (*orig_execvp)(const char *file, char *const argv[]) = NULL;

// 替代的 execvp 函数
int execvp(const char *file, char *const argv[]) {
    if (!orig_execvp) {
        // 使用 dlsym 获取原始的 execvp 函数
        orig_execvp = dlsym(RTLD_NEXT, "execvp");
    }

    // 打印捕获到的命令
    printf("Intercepted command: %s", file);
    for (int i = 0; argv[i]; i++) {
        printf(" %s", argv[i]);
    }
    printf("\n");

    // 调用原始的 execvp 函数
    return orig_execvp(file, argv);
}
