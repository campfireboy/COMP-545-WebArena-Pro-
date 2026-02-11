#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/wait.h>

#define MAX_LINE 256
#define MAX_USERS 100

/* =========================
   User Statistics Struct
   ========================= */
typedef struct {
    char username[50];
    int process_count;
    float total_cpu;
} UserStat;

/* =========================
   Helper: Find or Add User
   ========================= */
int find_or_add_user(UserStat users[], int *user_count, char *username) {

    for (int i = 0; i < *user_count; i++) {
        if (strcmp(users[i].username, username) == 0) {
            return i;
        }
    }

    // Add new user
    strcpy(users[*user_count].username, username);
    users[*user_count].process_count = 0;
    users[*user_count].total_cpu = 0.0;

    (*user_count)++;
    return (*user_count) - 1;
}

/* =========================
   Main Program
   ========================= */
int main(int argc, char *argv[]) {

    if (argc != 2) {
        fprintf(stderr, "Usage: %s <log_file>\n", argv[0]);
        return 1;
    }

    FILE *file = fopen(argv[1], "r");
    if (!file) {
        perror("Error opening file");
        return 1;
    }

    UserStat users[MAX_USERS];
    int user_count = 0;

    int total_entries = 0;
    float total_cpu = 0.0;
    float total_mem = 0.0;

    char line[MAX_LINE];

    /* =========================
       Read and Parse File
       ========================= */
    while (fgets(line, sizeof(line), file)) {

        char timestamp[20];
        char username[50];
        char process[50];
        float cpu, mem;

        if (sscanf(line, "%s %s %s %f %f",
                   timestamp, username, process, &cpu, &mem) != 5)
            continue;

        total_entries++;
        total_cpu += cpu;
        total_mem += mem;

        int index = find_or_add_user(users, &user_count, username);
        users[index].process_count++;
        users[index].total_cpu += cpu;
    }

    fclose(file);

    /* =========================
       Create Pipes
       ========================= */
    int cpu_pipe[2];
    int mem_pipe[2];

    pipe(cpu_pipe);
    pipe(mem_pipe);

    /* =========================
       Child Process 1 - CPU
       ========================= */
    pid_t cpu_child = fork();

    if (cpu_child == 0) {

        close(cpu_pipe[0]);

        float avg_cpu = total_cpu / total_entries;
        write(cpu_pipe[1], &avg_cpu, sizeof(avg_cpu));

        close(cpu_pipe[1]);
        exit(0);
    }

    /* =========================
       Child Process 2 - Memory
       ========================= */
    pid_t mem_child = fork();

    if (mem_child == 0) {

        close(mem_pipe[0]);

        float avg_mem = total_mem / total_entries;
        write(mem_pipe[1], &avg_mem, sizeof(avg_mem));

        close(mem_pipe[1]);
        exit(0);
    }

    /* =========================
       Parent Process
       ========================= */
    close(cpu_pipe[1]);
    close(mem_pipe[1]);

    float avg_cpu, avg_mem;

    read(cpu_pipe[0], &avg_cpu, sizeof(avg_cpu));
    read(mem_pipe[0], &avg_mem, sizeof(avg_mem));

    wait(NULL);
    wait(NULL);

    /* =========================
       Print Results
       ========================= */
    printf("===== LOG ANALYSIS =====\n");
    printf("Total Entries: %d\n", total_entries);
    printf("Average CPU: %.2f\n", avg_cpu);
    printf("Average Memory: %.2f\n\n", avg_mem);

    printf("--- User Stats ---\n");

    for (int i = 0; i < user_count; i++) {
        printf("%s -> Processes: %d CPU Total: %.2f\n",
               users[i].username,
               users[i].process_count,
               users[i].total_cpu);
    }

    return 0;
}
