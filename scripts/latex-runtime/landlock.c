#define _GNU_SOURCE
#include <linux/landlock.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/syscall.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <errno.h>
#ifndef LANDLOCK_ACCESS_FS_REFER
#define LANDLOCK_ACCESS_FS_REFER (1ULL << 13)
#endif
#ifndef LANDLOCK_ACCESS_FS_TRUNCATE
#define LANDLOCK_ACCESS_FS_TRUNCATE (1ULL << 14)
#endif
#define LL_IOCTL (1ULL << 15)
static void die(void) { _exit(78); }
static void rule(int ruleset, const char *path, uint64_t rights) {
 int fd = open(path, O_PATH | O_CLOEXEC); if (fd < 0) die();
 struct landlock_path_beneath_attr attr = {.allowed_access=rights,.parent_fd=fd};
 if (syscall(__NR_landlock_add_rule,ruleset,LANDLOCK_RULE_PATH_BENEATH,&attr,0)) die();
 close(fd);
}
int main(int argc, char **argv) {
 if (argc < 2 || (strcmp(argv[1],"/usr/bin/xetex") && strcmp(argv[1],"/usr/bin/xdvipdfmx") && strcmp(argv[1],"--probe"))) die();
 int abi=syscall(__NR_landlock_create_ruleset,NULL,0,LANDLOCK_CREATE_RULESET_VERSION); if(abi<6) die();
 uint64_t all=(1ULL<<16)-1;
 struct landlock_ruleset_attr attr={.handled_access_fs=all};
 int rs=syscall(__NR_landlock_create_ruleset,&attr,sizeof(attr),0); if(rs<0) die();
 FILE *list=fopen("/opt/latex/read-paths","r"); if(!list) die();
 char *line=NULL; size_t size=0; ssize_t len;
 while((len=getline(&line,&size,list))>0) { if(line[len-1]=='\n') line[len-1]=0; struct stat st; if(stat(line,&st)) die(); rule(rs,line,S_ISDIR(st.st_mode)?LANDLOCK_ACCESS_FS_READ_DIR:LANDLOCK_ACCESS_FS_READ_FILE); }
 free(line); fclose(list);
 rule(rs,"/usr/bin/xetex",LANDLOCK_ACCESS_FS_EXECUTE|LANDLOCK_ACCESS_FS_READ_FILE);
 rule(rs,"/usr/bin/xdvipdfmx",LANDLOCK_ACCESS_FS_EXECUTE|LANDLOCK_ACCESS_FS_READ_FILE);
 // The kernel invokes the reviewed ELF interpreter for each approved executable.
 list=fopen("/opt/latex/loader-paths","r"); if(!list) die(); line=NULL;size=0;
 while((len=getline(&line,&size,list))>0) { if(line[len-1]=='\n') line[len-1]=0;rule(rs,line,LANDLOCK_ACCESS_FS_EXECUTE|LANDLOCK_ACCESS_FS_READ_FILE); } free(line);fclose(list);
 uint64_t scratch=all & ~(LANDLOCK_ACCESS_FS_EXECUTE|LANDLOCK_ACCESS_FS_MAKE_CHAR|LANDLOCK_ACCESS_FS_MAKE_BLOCK|LANDLOCK_ACCESS_FS_MAKE_SOCK|LANDLOCK_ACCESS_FS_MAKE_FIFO|LL_IOCTL);
 rule(rs,"/scratch",scratch);
 rule(rs,"/dev/null",LANDLOCK_ACCESS_FS_READ_FILE|LANDLOCK_ACCESS_FS_WRITE_FILE);
 rule(rs,"/dev/urandom",LANDLOCK_ACCESS_FS_READ_FILE);
 if(prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0) || syscall(__NR_landlock_restrict_self,rs,0)) die();
 close(rs);
 for(int fd=3;fd<64;fd++) close(fd);
 struct rlimit cpu={10,10}, file={8388608,8388608}, core={0,0};
 if(setrlimit(RLIMIT_CPU,&cpu)||setrlimit(RLIMIT_FSIZE,&file)||setrlimit(RLIMIT_CORE,&core)) die();
 if (!strcmp(argv[1],"--probe")) {
  int denied=0; int fd=open("/etc/passwd",O_RDONLY); if(fd<0 && errno==EACCES) denied++; else if(fd>=0)close(fd);
  fd=open("/opt/latex/packages.lock",O_RDONLY); if(fd<0 && errno==EACCES)denied++; else if(fd>=0)close(fd);
  int approved=0;fd=open("/usr/share/texlive/texmf-dist/tex/latex/base/article.cls",O_RDONLY);if(fd>=0){approved=1;close(fd);}
  int scratchok=0;fd=open("/scratch/probe-owned",O_CREAT|O_WRONLY|O_TRUNC,0600);if(fd>=0){scratchok=1;close(fd);unlink("/scratch/probe-owned");}
  int outside=0;fd=open("/tmp/probe-denied",O_CREAT|O_WRONLY,0600);if(fd<0)outside=1;else close(fd);
  pid_t child=fork();if(child<0)die();if(child==0){char *args[]={"/bin/sh","-c","exit 0",NULL};execve("/bin/sh",args,NULL);_exit(errno==EACCES?0:1);}
  int status=0;if(waitpid(child,&status,0)<0)die();int execdenied=WIFEXITED(status)&&WEXITSTATUS(status)==0;
  printf("{\"abi\":%d,\"deniedReads\":%d,\"approvedRead\":%d,\"scratchWrite\":%d,\"outsideWriteDenied\":%d,\"shellExecDenied\":%d}\n",abi,denied,approved,scratchok,outside,execdenied);
  return denied==2 && approved && scratchok && outside && execdenied?0:79;
 }
 char *env[]={"HOME=/opt/latex/home","LANG=C.UTF-8",
 "FONTCONFIG_FILE=/opt/latex/fontconfig/fonts.conf","FONTCONFIG_PATH=/opt/latex/fontconfig",
 "TEXMFCNF=/opt/latex","TEXMFOUTPUT=/scratch","SOURCE_DATE_EPOCH=1735689600","FORCE_SOURCE_DATE=1",NULL};
 execve(argv[1],argv+1,env);die();
}
