// Ejercita el puente de archivos y el esquema de la app con carpetas temporales, sin abrir la app.
#define main modeladorAppMain
#import "AppMain.m"
#undef main

static NSURL *testBackups;
static NSMutableArray<NSString *> *wouldTrash;
@interface TestFilesBridge : FilesBridge
@end
@implementation TestFilesBridge
// La prueba no toca la Papelera real: solo anota qué se habría movido.
- (BOOL)trashItemAtURL:(NSURL *)url { [wouldTrash addObject:url.lastPathComponent]; return YES; }
- (NSURL *)backupsDirectory { return testBackups; }
// Todo cuenta como viejo: la fecha de «agregado a la carpeta» no se puede retrasar en una prueba.
- (NSTimeInterval)minimumAgeForCollection { return -1; }
@end

@interface Probe : NSObject <WKNavigationDelegate>
@property(nonatomic, strong) WKWebView *webView;
@end
@implementation Probe
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    NSString *script = @"const r = await fetch(new URL('probe.js', document.baseURI).href); return JSON.stringify([r.status, r.ok, r.headers.get('content-type'), (await r.text()).length]);";
    [webView callAsyncJavaScript:script arguments:@{} inFrame:nil inContentWorld:WKContentWorld.pageWorld completionHandler:^(id result, NSError *error) {
        if (error || ![result isEqual:@"[200,true,\"text/javascript; charset=utf-8\",15]"]) {
            printf("fetch through the scheme is not a 200 response: %s %s\n", [[result description] UTF8String], [[error description] UTF8String]);
            exit(1);
        }
        printf("pick names, gc and scheme response checks passed\n");
        exit(0);
    }];
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSURL *root = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]] isDirectory:YES];
        NSURL *source = [root URLByAppendingPathComponent:@"mi viaje recortado-2.pdf"];
        [@"%PDF-1.4 prueba" writeToURL:source atomically:YES encoding:NSUTF8StringEncoding error:nil];
        NSURL *archivos = [root URLByAppendingPathComponent:@"Archivos" isDirectory:YES];
        [NSFileManager.defaultManager createDirectoryAtURL:archivos withIntermediateDirectories:YES attributes:nil error:nil];

        FilesBridge *bridge = [[FilesBridge alloc] init];
        NSString *failure = nil;
        NSDictionary *picked = [bridge importPDFAtURL:source directory:archivos fileId:nil failure:&failure];
        // Lo que la app muestra es el nombre del original; el archivo guardado se llama como su id.
        if (![picked[@"name"] isEqual:@"mi viaje recortado-2.pdf"] || !IsValidFileId(picked[@"id"]) ||
            ![NSFileManager.defaultManager fileExistsAtPath:[archivos URLByAppendingPathComponent:[picked[@"id"] stringByAppendingString:@".pdf"]].path]) {
            printf("unexpected pick reply: %s\n", [[picked description] UTF8String]);
            return 1;
        }
        NSDictionary *replaced = [bridge importPDFAtURL:source directory:archivos fileId:picked[@"id"] failure:&failure];
        if (![replaced[@"id"] isEqual:picked[@"id"]] || ![replaced[@"name"] isEqual:@"mi viaje recortado-2.pdf"]) {
            printf("unexpected replace reply\n");
            return 1;
        }

        // El GC no recolecta nada si los respaldos no se pueden leer ni si un respaldo nombra el archivo.
        NSURL *orphan = [archivos URLByAppendingPathComponent:@"huerfano.pdf"];
        [@"%PDF-1.4 x" writeToURL:orphan atomically:YES encoding:NSUTF8StringEncoding error:nil];
        NSDate *old = [NSDate dateWithTimeIntervalSinceNow:-30 * 24 * 3600];
        [NSFileManager.defaultManager setAttributes:@{NSFileModificationDate: old, NSFileCreationDate: old} ofItemAtPath:orphan.path error:nil];
        wouldTrash = [NSMutableArray array];
        TestFilesBridge *gcBridge = [[TestFilesBridge alloc] init];
        testBackups = [root URLByAppendingPathComponent:@"Respaldos-ilegible"];
        [@"no es una carpeta" writeToURL:testBackups atomically:YES encoding:NSUTF8StringEncoding error:nil];
        if ([gcBridge collectUnreferencedIn:archivos referenced:[NSSet setWithObject:picked[@"id"]]] != 0 || ![NSFileManager.defaultManager fileExistsAtPath:orphan.path]) {
            printf("gc collected with unreadable backups\n");
            return 1;
        }
        testBackups = [root URLByAppendingPathComponent:@"Respaldos" isDirectory:YES];
        [NSFileManager.defaultManager createDirectoryAtURL:testBackups withIntermediateDirectories:YES attributes:nil error:nil];
        [@"{\"files\":[{\"id\":\"huerfano\"}]}" writeToURL:[testBackups URLByAppendingPathComponent:@"respaldo-1.json"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
        if ([gcBridge collectUnreferencedIn:archivos referenced:[NSSet setWithObject:picked[@"id"]]] != 0 || ![NSFileManager.defaultManager fileExistsAtPath:orphan.path]) {
            printf("gc collected a file named by a backup\n");
            return 1;
        }

        testBackups = [root URLByAppendingPathComponent:@"Respaldos-vacio" isDirectory:YES];
        [NSFileManager.defaultManager createDirectoryAtURL:testBackups withIntermediateDirectories:YES attributes:nil error:nil];
        NSURL *undated = [archivos URLByAppendingPathComponent:@"otro.pdf"];
        [@"%PDF-1.4 y" writeToURL:undated atomically:YES encoding:NSUTF8StringEncoding error:nil];
        wouldTrash = [NSMutableArray array];
        if ([gcBridge collectUnreferencedIn:archivos referenced:[NSSet setWithArray:@[@"huerfano", picked[@"id"]]]] != 1 ||
            ![wouldTrash isEqual:@[@"otro.pdf"]]) {
            printf("gc did not collect exactly the unreferenced file\n");
            return 1;
        }

        // Archivos como enlace simbólico: un destino nuevo (que todavía no existe) tiene que aceptarse.
        NSURL *linked = [root URLByAppendingPathComponent:@"Enlace" isDirectory:YES];
        [NSFileManager.defaultManager createSymbolicLinkAtURL:linked withDestinationURL:archivos error:nil];
        NSDictionary *viaLink = [bridge importPDFAtURL:source directory:linked fileId:nil failure:&failure];
        if (!viaLink || !ArchivoURL(@"nuevo-id", linked)) {
            printf("a symlinked Archivos folder rejected a new file\n");
            return 1;
        }

        [@"console.log(1);" writeToURL:[root URLByAppendingPathComponent:@"probe.js"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
        [@"<html></html>" writeToURL:[root URLByAppendingPathComponent:@"index.html"] atomically:YES encoding:NSUTF8StringEncoding error:nil];
        [NSApplication sharedApplication];
        WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
        [configuration setURLSchemeHandler:[[AppSchemeHandler alloc] initWithResourceDirectory:root] forURLScheme:kAppScheme];
        Probe *probe = [Probe new];
        probe.webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 100, 100) configuration:configuration];
        probe.webView.navigationDelegate = probe;
        [probe.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"modeladorv2://app/index.html"]]];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 20 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{ printf("timeout\n"); exit(1); });
        [NSApp run];
    }
    return 0;
}
