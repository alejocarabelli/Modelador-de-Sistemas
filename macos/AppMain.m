#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

/*
 * La 2.0 reemplazó a la v1 y se llama igual que ella. El esquema de URL (origen
 * web) y el bundle id del Info.plist siguen siendo los de la 2.0: WebKit guarda
 * los proyectos por bundle id y por origen, así que cambiarlos los escondería.
 */
static NSString *const kAppName = @"Modelador de Sistemas";
static NSString *const kAppScheme = @"modeladorv2";

#pragma mark - Archivos (PDF) de los proyectos

/*
 * Los PDF de los proyectos viven en ~/Documents/Modelador de Sistemas/Archivos/<fileId>.pdf, junto a
 * los respaldos (y, como ellos, se sincronizan con iCloud Drive si Documentos está en iCloud). El proyecto
 * guarda solo los metadatos. Toda ruta se arma con un fileId validado y se verifica que, ya resuelta,
 * siga dentro de esa carpeta.
 */
static NSUInteger const kMaxArchivoBytes = 50 * 1024 * 1024;
static NSTimeInterval const kArchivoMinAgeForCollection = 7 * 24 * 60 * 60;
static NSString *const kArchivosPathPrefix = @"__archivos/";

static NSURL *DocumentsSubfolder(NSString *name, BOOL create, NSError **error) {
    NSURL *documents = [[NSFileManager defaultManager] URLForDirectory:NSDocumentDirectory
                                                              inDomain:NSUserDomainMask
                                                     appropriateForURL:nil
                                                                create:create
                                                                 error:error];
    if (!documents) {
        return nil;
    }
    NSURL *directory = [[documents URLByAppendingPathComponent:kAppName isDirectory:YES]
        URLByAppendingPathComponent:name isDirectory:YES];
    if (create && ![[NSFileManager defaultManager] createDirectoryAtURL:directory
                                            withIntermediateDirectories:YES
                                                             attributes:nil
                                                                  error:error]) {
        return nil;
    }
    return directory;
}

static BOOL IsValidFileId(id value) {
    if (![value isKindOfClass:NSString.class]) {
        return NO;
    }
    NSString *fileId = (NSString *)value;
    NSRange match = [fileId rangeOfString:@"^[A-Za-z0-9_-]{1,64}$" options:NSRegularExpressionSearch];
    return match.location == 0 && match.length == fileId.length;
}

/// El PDF de un fileId válido, o nil si el id no sirve o la ruta resuelta se sale de la carpeta Archivos.
static NSURL *ArchivoURL(id fileId, NSURL *directory) {
    if (!IsValidFileId(fileId) || !directory) {
        return nil;
    }
    // La carpeta se resuelve primero (Archivos o Documentos pueden ser enlaces) y el destino se arma desde ella:
    // un PDF que todavía no existe no se puede resolver por sí solo.
    NSURL *resolvedDirectory = directory.URLByResolvingSymlinksInPath;
    NSURL *candidate = [resolvedDirectory URLByAppendingPathComponent:[(NSString *)fileId stringByAppendingPathExtension:@"pdf"]
                                                          isDirectory:NO];
    NSString *root = [resolvedDirectory.path stringByAppendingString:@"/"];
    return [candidate.URLByResolvingSymlinksInPath.path hasPrefix:root] ? candidate : nil;
}

static BOOL HasPDFSignature(NSData *head) {
    return head.length >= 5 && memcmp(head.bytes, "%PDF-", 5) == 0;
}

@interface AppSchemeHandler : NSObject <WKURLSchemeHandler>
@property(nonatomic, strong) NSURL *resourceDirectory;
- (instancetype)initWithResourceDirectory:(NSURL *)resourceDirectory;
@end

@implementation AppSchemeHandler
- (instancetype)initWithResourceDirectory:(NSURL *)resourceDirectory {
    self = [super init];
    if (self) {
        _resourceDirectory = resourceDirectory;
    }
    return self;
}

- (NSString *)mimeTypeForExtension:(NSString *)extension {
    NSDictionary<NSString *, NSString *> *types = @{
        @"html": @"text/html",
        @"js": @"text/javascript",
        @"css": @"text/css",
        @"json": @"application/json",
        @"png": @"image/png",
        @"jpg": @"image/jpeg",
        @"jpeg": @"image/jpeg",
        @"svg": @"image/svg+xml",
        @"woff": @"font/woff",
        @"woff2": @"font/woff2",
        // pdf.js: el worker es un módulo .mjs (con otro tipo WebKit no lo carga), más sus decodificadores y CMaps.
        @"mjs": @"text/javascript",
        @"pdf": @"application/pdf",
        @"wasm": @"application/wasm",
        @"bcmap": @"application/octet-stream"
    };
    return types[extension.lowercaseString] ?: @"application/octet-stream";
}

- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
    NSString *requestedPath = urlSchemeTask.request.URL.path.stringByRemovingPercentEncoding ?: @"";
    while ([requestedPath hasPrefix:@"/"]) {
        requestedPath = [requestedPath substringFromIndex:1];
    }
    if (requestedPath.length == 0) {
        requestedPath = @"index.html";
    }

    NSURL *fileURL = nil;
    NSDataReadingOptions readingOptions = 0;
    if ([requestedPath hasPrefix:kArchivosPathPrefix]) {
        // Los PDF de los proyectos salen de Documents, no del bundle: solo «<fileId>.pdf», nada de subcarpetas.
        NSString *name = [requestedPath substringFromIndex:kArchivosPathPrefix.length];
        BOOL isPDFName = [name.pathExtension isEqualToString:@"pdf"];
        fileURL = isPDFName ? ArchivoURL(name.stringByDeletingPathExtension, DocumentsSubfolder(@"Archivos", NO, nil)) : nil;
        readingOptions = NSDataReadingMappedIfSafe;
        if (!fileURL) {
            NSError *error = [NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorNoPermissionsToReadFile userInfo:nil];
            [urlSchemeTask didFailWithError:error];
            return;
        }
    } else {
        fileURL = [self.resourceDirectory URLByAppendingPathComponent:requestedPath];
        NSString *rootPath = self.resourceDirectory.URLByStandardizingPath.path;
        NSString *filePath = fileURL.URLByStandardizingPath.path;
        if (![filePath hasPrefix:[rootPath stringByAppendingString:@"/"]] && ![filePath isEqualToString:rootPath]) {
            NSError *error = [NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorNoPermissionsToReadFile userInfo:nil];
            [urlSchemeTask didFailWithError:error];
            return;
        }
    }

    NSError *readError = nil;
    NSData *data = [NSData dataWithContentsOfURL:fileURL options:readingOptions error:&readError];
    if (!data) {
        [urlSchemeTask didFailWithError:readError ?: [NSError errorWithDomain:NSURLErrorDomain code:NSURLErrorFileDoesNotExist userInfo:nil]];
        return;
    }

    NSString *extension = fileURL.pathExtension.lowercaseString;
    BOOL isText = [@[@"html", @"js", @"mjs", @"css"] containsObject:extension];
    NSString *mime = [self mimeTypeForExtension:extension];
    // Una respuesta HTTP (200): con una NSURLResponse común fetch() ve status 0 y ok == false, y el visor
    // de PDF tomaba por faltante un archivo que sí estaba.
    NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc]
        initWithURL:urlSchemeTask.request.URL
         statusCode:200
        HTTPVersion:@"HTTP/1.1"
       headerFields:@{
           @"Content-Type": isText ? [mime stringByAppendingString:@"; charset=utf-8"] : mime,
           @"Content-Length": [NSString stringWithFormat:@"%lu", (unsigned long)data.length]
       }];
    [urlSchemeTask didReceiveResponse:response];
    [urlSchemeTask didReceiveData:data];
    [urlSchemeTask didFinish];
}

- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)urlSchemeTask {
}
@end

@interface WebCoordinator : NSObject <WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate>
@property(nonatomic, weak) NSWindow *window;
- (instancetype)initWithWindow:(NSWindow *)window;
@end

@implementation WebCoordinator
- (instancetype)initWithWindow:(NSWindow *)window {
    self = [super init];
    if (self) {
        _window = window;
    }
    return self;
}

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    if (navigationAction.shouldPerformDownload) {
        decisionHandler(WKNavigationActionPolicyDownload);
        return;
    }

    NSURL *url = navigationAction.request.URL;
    NSString *scheme = url.scheme.lowercaseString;
    if (navigationAction.navigationType == WKNavigationTypeLinkActivated &&
        ([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"])) {
        [[NSWorkspace sharedWorkspace] openURL:url];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }

    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationResponse:(WKNavigationResponse *)navigationResponse
    decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler {
    decisionHandler(navigationResponse.canShowMIMEType
        ? WKNavigationResponsePolicyAllow
        : WKNavigationResponsePolicyDownload);
}

- (void)webView:(WKWebView *)webView
    navigationAction:(WKNavigationAction *)navigationAction
    didBecomeDownload:(WKDownload *)download {
    download.delegate = self;
}

- (void)webView:(WKWebView *)webView
    navigationResponse:(WKNavigationResponse *)navigationResponse
    didBecomeDownload:(WKDownload *)download {
    download.delegate = self;
}

- (void)download:(WKDownload *)download
    decideDestinationUsingResponse:(NSURLResponse *)response
    suggestedFilename:(NSString *)suggestedFilename
    completionHandler:(void (^)(NSURL * _Nullable destination))completionHandler {
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.nameFieldStringValue = suggestedFilename;
    panel.canCreateDirectories = YES;

    void (^finish)(NSModalResponse) = ^(NSModalResponse result) {
        completionHandler(result == NSModalResponseOK ? panel.URL : nil);
    };
    if (self.window) {
        [panel beginSheetModalForWindow:self.window completionHandler:finish];
    } else {
        [panel beginWithCompletionHandler:finish];
    }
}

- (void)webView:(WKWebView *)webView
    runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters
    initiatedByFrame:(WKFrameInfo *)frame
    completionHandler:(void (^)(NSArray<NSURL *> * _Nullable URLs))completionHandler {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection;
    panel.canChooseDirectories = parameters.allowsDirectories;
    panel.canChooseFiles = YES;

    void (^finish)(NSModalResponse) = ^(NSModalResponse result) {
        completionHandler(result == NSModalResponseOK ? panel.URLs : nil);
    };
    if (self.window) {
        [panel beginSheetModalForWindow:self.window completionHandler:finish];
    } else {
        [panel beginWithCompletionHandler:finish];
    }
}

- (void)webView:(WKWebView *)webView
    runJavaScriptAlertPanelWithMessage:(NSString *)message
    initiatedByFrame:(WKFrameInfo *)frame
    completionHandler:(void (^)(void))completionHandler {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = kAppName;
    alert.informativeText = message;
    [alert addButtonWithTitle:@"Aceptar"];
    [alert beginSheetModalForWindow:self.window completionHandler:^(__unused NSModalResponse result) {
        completionHandler();
    }];
}

- (void)webView:(WKWebView *)webView
    runJavaScriptConfirmPanelWithMessage:(NSString *)message
    initiatedByFrame:(WKFrameInfo *)frame
    completionHandler:(void (^)(BOOL result))completionHandler {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = kAppName;
    alert.informativeText = message;
    [alert addButtonWithTitle:@"Aceptar"];
    [alert addButtonWithTitle:@"Cancelar"];
    [alert beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
        completionHandler(result == NSAlertFirstButtonReturn);
    }];
}

- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {
    [webView reload];
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    NSString *storageCheck = @"(() => { try { localStorage.setItem('__desktop_storage_test__', 'ok'); const valid = localStorage.getItem('__desktop_storage_test__') === 'ok'; localStorage.removeItem('__desktop_storage_test__'); return valid; } catch (_) { return false; } })()";
    [webView evaluateJavaScript:storageCheck completionHandler:^(id result, NSError *error) {
        if (error || ![result boolValue]) {
            NSAlert *alert = [[NSAlert alloc] init];
            alert.messageText = @"No se puede guardar localmente";
            alert.informativeText = @"La aplicación abrió correctamente, pero macOS no habilitó el almacenamiento persistente. Exportá tus proyectos como JSON antes de cerrar.";
            [alert beginSheetModalForWindow:self.window completionHandler:nil];
        }
    }];
}
@end


#pragma mark - Respaldo en disco

/**
 * Los proyectos viven en el localStorage del WKWebView, que macOS puede vaciar
 * sin aviso. Este puente escribe una copia rotativa en
 * ~/Documents/Modelador de Sistemas/Respaldos, que además se sincroniza sola si
 * el usuario tiene iCloud Drive activado sobre Documentos.
 */
static NSUInteger const kBackupsToKeep = 10;

@interface BackupBridge : NSObject <WKScriptMessageHandlerWithReply>
@end

@implementation BackupBridge

+ (NSURL *)backupDirectoryCreatingIfNeeded:(NSError **)error {
    NSURL *documents = [[NSFileManager defaultManager] URLForDirectory:NSDocumentDirectory
                                                              inDomain:NSUserDomainMask
                                                     appropriateForURL:nil
                                                                create:YES
                                                                 error:error];
    if (!documents) {
        return nil;
    }
    NSURL *directory = [[documents URLByAppendingPathComponent:kAppName isDirectory:YES]
        URLByAppendingPathComponent:@"Respaldos" isDirectory:YES];
    if (![[NSFileManager defaultManager] createDirectoryAtURL:directory
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:error]) {
        return nil;
    }
    return directory;
}

+ (NSArray<NSURL *> *)backupsIn:(NSURL *)directory {
    NSArray<NSURL *> *entries = [[NSFileManager defaultManager]
        contentsOfDirectoryAtURL:directory
      includingPropertiesForKeys:@[NSURLContentModificationDateKey, NSURLIsRegularFileKey]
                         options:NSDirectoryEnumerationSkipsHiddenFiles
                           error:nil];
    NSMutableArray<NSURL *> *backups = [NSMutableArray array];
    for (NSURL *entry in entries) {
        if ([entry.lastPathComponent hasPrefix:@"respaldo-"] && [entry.pathExtension isEqualToString:@"json"]) {
            NSNumber *regular = nil;
            [entry getResourceValue:&regular forKey:NSURLIsRegularFileKey error:nil];
            if (regular.boolValue) [backups addObject:entry];
        }
    }
    [backups sortUsingComparator:^NSComparisonResult(NSURL *left, NSURL *right) {
        NSDate *leftDate = nil, *rightDate = nil;
        [left getResourceValue:&leftDate forKey:NSURLContentModificationDateKey error:nil];
        [right getResourceValue:&rightDate forKey:NSURLContentModificationDateKey error:nil];
        return [rightDate compare:leftDate];
    }];
    return backups;
}

+ (void)pruneBackupsIn:(NSURL *)directory {
    NSArray<NSURL *> *backups = [self backupsIn:directory];
    if (backups.count <= kBackupsToKeep) {
        return;
    }
    for (NSUInteger index = kBackupsToKeep; index < backups.count; index++) {
        [[NSFileManager defaultManager] removeItemAtURL:backups[index] error:nil];
    }
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message
                 replyHandler:(void (^)(id reply, NSString *errorMessage))replyHandler {
    NSDictionary *body = [message.body isKindOfClass:NSDictionary.class] ? message.body : nil;
    NSString *action = body[@"action"];
    NSError *error = nil;
    NSURL *directory = [self.class backupDirectoryCreatingIfNeeded:&error];

    if (!directory) {
        replyHandler(nil, error.localizedDescription ?: @"No se pudo preparar la carpeta de respaldos.");
        return;
    }

    if ([action isEqualToString:@"reveal"]) {
        [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[directory]];
        replyHandler(@{@"path": directory.path}, nil);
        return;
    }

    BOOL preserve = [action isEqualToString:@"preserve"];
    if (![action isEqualToString:@"write"] && !preserve) {
        replyHandler(nil, @"Acción de respaldo desconocida.");
        return;
    }

    NSString *payload = body[@"payload"];
    if (![payload isKindOfClass:NSString.class] || payload.length == 0) {
        replyHandler(nil, @"El respaldo llegó vacío.");
        return;
    }

    if (!preserve) {
        NSURL *latest = [self.class backupsIn:directory].firstObject;
        NSString *previous = latest ? [NSString stringWithContentsOfURL:latest encoding:NSUTF8StringEncoding error:nil] : nil;
        if ([previous isEqualToString:payload]) {
            replyHandler(@{@"path": latest.path, @"directory": directory.path}, nil);
            return;
        }
    }

    NSDateFormatter *stamp = [[NSDateFormatter alloc] init];
    stamp.dateFormat = @"yyyy-MM-dd-HHmmss-SSS";
    stamp.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    NSString *base = [NSString stringWithFormat:@"%@-%@", preserve ? @"recuperacion" : @"respaldo", [stamp stringFromDate:[NSDate date]]];
    NSURL *destination = [directory URLByAppendingPathComponent:[base stringByAppendingPathExtension:@"json"]];
    // Two snapshots in the same millisecond must never overwrite each other.
    for (NSUInteger copy = 2; [[NSFileManager defaultManager] fileExistsAtPath:destination.path]; copy++) {
        destination = [directory URLByAppendingPathComponent:[NSString stringWithFormat:@"%@-%lu.json", base, (unsigned long)copy]];
    }

    if (![payload writeToURL:destination atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
        replyHandler(nil, error.localizedDescription ?: @"No se pudo escribir el respaldo.");
        return;
    }

    if (!preserve) [self.class pruneBackupsIn:directory];
    replyHandler(@{@"path": destination.path, @"directory": directory.path}, nil);
}

@end

#pragma mark - Propuestas de Claude

/**
 * La extensión de Claude Desktop (claude-mcp/) deja propuestas de cambio en
 * ~/Documents/Modelador de Sistemas/Claude/Propuestas, un JSON por propuesta.
 * Este puente solo las lista y, cuando el usuario aplica o descarta una, la
 * borra. Nunca aplica nada: eso lo decide el usuario en la app.
 */
static unsigned long long const kMaxProposalBytes = 8 * 1024 * 1024;

@interface ClaudeBridge : NSObject <WKScriptMessageHandlerWithReply>
@end

@implementation ClaudeBridge

+ (NSURL *)proposalsDirectory {
    NSURL *documents = [[NSFileManager defaultManager] URLForDirectory:NSDocumentDirectory
                                                              inDomain:NSUserDomainMask
                                                     appropriateForURL:nil
                                                                create:NO
                                                                 error:nil];
    if (!documents) {
        return nil;
    }
    return [[[documents URLByAppendingPathComponent:kAppName isDirectory:YES]
        URLByAppendingPathComponent:@"Claude" isDirectory:YES]
        URLByAppendingPathComponent:@"Propuestas" isDirectory:YES];
}

/** Solo un nombre de archivo suelto: nada de rutas que salgan de la carpeta. */
+ (BOOL)isProposalName:(NSString *)name {
    return [name isKindOfClass:NSString.class] && name.length > 0 && ![name hasPrefix:@"."]
        && [name.pathExtension isEqualToString:@"json"]
        && [name rangeOfString:@"/"].location == NSNotFound
        && [name rangeOfString:@"\\"].location == NSNotFound;
}

+ (NSArray<NSDictionary *> *)proposalsIn:(NSURL *)directory {
    NSArray<NSURL *> *entries = [[NSFileManager defaultManager]
        contentsOfDirectoryAtURL:directory
      includingPropertiesForKeys:@[NSURLIsRegularFileKey, NSURLFileSizeKey]
                         options:NSDirectoryEnumerationSkipsHiddenFiles
                           error:nil];
    NSMutableArray<NSDictionary *> *proposals = [NSMutableArray array];
    for (NSURL *entry in entries) {
        NSString *name = entry.lastPathComponent;
        if (![self isProposalName:name]) continue;
        NSNumber *regular = nil, *size = nil;
        [entry getResourceValue:&regular forKey:NSURLIsRegularFileKey error:nil];
        [entry getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
        if (!regular.boolValue || size.unsignedLongLongValue > kMaxProposalBytes) continue;
        NSString *text = [NSString stringWithContentsOfURL:entry encoding:NSUTF8StringEncoding error:nil];
        if (text) [proposals addObject:@{@"file": name, @"text": text}];
    }
    // Los nombres empiezan con la fecha: así sale primero la más vieja.
    [proposals sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
        return [left[@"file"] compare:right[@"file"]];
    }];
    return proposals;
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message
                 replyHandler:(void (^)(id reply, NSString *errorMessage))replyHandler {
    NSDictionary *body = [message.body isKindOfClass:NSDictionary.class] ? message.body : nil;
    NSString *action = body[@"action"];
    NSString *file = body[@"file"];
    NSURL *directory = [self.class proposalsDirectory];

    // Leer y borrar archivos fuera del hilo principal; la respuesta vuelve en él.
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        id reply = nil;
        NSString *errorMessage = nil;
        if ([action isEqualToString:@"list"]) {
            reply = @{@"proposals": directory ? [self.class proposalsIn:directory] : @[]};
        } else if ([action isEqualToString:@"resolve"]) {
            if (!directory || ![self.class isProposalName:file]) {
                errorMessage = @"Propuesta inválida.";
            } else {
                NSURL *target = [directory URLByAppendingPathComponent:file isDirectory:NO];
                [[NSFileManager defaultManager] removeItemAtURL:target error:nil];
                reply = @{@"ok": @YES};
            }
        } else {
            errorMessage = @"Acción desconocida.";
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            replyHandler(reply, errorMessage);
        });
    });
}

@end

/*
 * Puente de los PDF de los proyectos (ver «Archivos» más arriba). La lectura no pasa por acá: el
 * AppSchemeHandler los sirve en modeladorv2://app/__archivos/<fileId>.pdf. Las ventanas secundarias
 * reciben una instancia de solo consulta (readOnly): pueden mostrar en Finder y abrir en Vista
 * Previa, pero no guardar ni recolectar.
 *
 * Nada acá borra para siempre: lo que sobra va a la Papelera. Ni quitar un archivo ni borrar un proyecto
 * tocan el PDF (podría estar en un respaldo); solo `gc`, al iniciar, mueve a la Papelera los que ningún
 * proyecto ni respaldo nombra y que tienen más de una semana.
 */
@interface FilesBridge : NSObject <WKScriptMessageHandlerWithReply>
@property(nonatomic, weak) NSWindow *window;
@property(nonatomic) BOOL readOnly;
@end

@implementation FilesBridge

- (NSDictionary *)descriptorForURL:(NSURL *)url name:(NSString *)name {
    NSNumber *size = nil;
    [url getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
    return @{@"id": url.lastPathComponent.stringByDeletingPathExtension, @"name": name, @"size": size ?: @0};
}

/// Copia un PDF elegido en el panel a Archivos. Devuelve el descriptor, o el motivo del rechazo.
- (NSDictionary *)importPDFAtURL:(NSURL *)source
                       directory:(NSURL *)directory
                         fileId:(NSString *)requestedId
                         failure:(NSString **)failure {
    NSFileManager *manager = NSFileManager.defaultManager;
    NSNumber *size = nil;
    [source getResourceValue:&size forKey:NSURLFileSizeKey error:nil];
    if (size.unsignedLongLongValue == 0) {
        *failure = @"empty";
        return nil;
    }
    if (size.unsignedLongLongValue > kMaxArchivoBytes) {
        *failure = @"too-large";
        return nil;
    }
    NSFileHandle *handle = [NSFileHandle fileHandleForReadingFromURL:source error:nil];
    NSData *head = [handle readDataUpToLength:5 error:nil];
    [handle closeAndReturnError:nil];
    if (!HasPDFSignature(head)) {
        *failure = @"not-pdf";
        return nil;
    }
    NSString *fileId = requestedId ?: NSUUID.UUID.UUIDString.lowercaseString;
    NSURL *destination = ArchivoURL(fileId, directory);
    NSURL *temporary = [directory URLByAppendingPathComponent:[NSString stringWithFormat:@".%@.tmp", NSUUID.UUID.UUIDString]];
    if (!destination || ![manager copyItemAtURL:source toURL:temporary error:nil]) {
        *failure = @"failed";
        return nil;
    }
    BOOL placed = [manager fileExistsAtPath:destination.path]
        ? [manager replaceItemAtURL:destination withItemAtURL:temporary backupItemName:nil options:0 resultingItemURL:nil error:nil]
        : [manager moveItemAtURL:temporary toURL:destination error:nil];
    if (!placed) {
        [manager removeItemAtURL:temporary error:nil];
        *failure = @"failed";
        return nil;
    }
    // El nombre que se muestra es el del PDF original, no el del archivo guardado (que se llama como su id).
    return [self descriptorForURL:destination name:source.lastPathComponent];
}

- (void)pickWithDirectory:(NSURL *)directory replaceId:(NSString *)replaceId reply:(void (^)(id reply, NSString *errorMessage))replyHandler {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = replaceId == nil;
    // allowedContentTypes pide UniformTypeIdentifiers (macOS 11+) y este archivo se compila solo con AppKit y WebKit.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    panel.allowedFileTypes = @[@"pdf"];
#pragma clang diagnostic pop
    panel.message = replaceId ? @"Elegí el PDF para volver a agregarlo." : @"Elegí uno o más PDF para agregar al proyecto.";
    panel.prompt = @"Agregar";

    void (^finish)(NSModalResponse) = ^(NSModalResponse result) {
        if (result != NSModalResponseOK || panel.URLs.count == 0) {
            replyHandler(NSNull.null, nil);
            return;
        }
        NSArray<NSURL *> *chosen = replaceId ? @[panel.URLs.firstObject] : panel.URLs;
        // Copiar hasta 50 MB por archivo no corresponde al hilo principal.
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            NSMutableArray *files = [NSMutableArray array];
            NSMutableArray *rejected = [NSMutableArray array];
            for (NSURL *url in chosen) {
                NSString *failure = nil;
                NSDictionary *descriptor = [self importPDFAtURL:url directory:directory fileId:replaceId failure:&failure];
                if (descriptor) {
                    [files addObject:descriptor];
                } else {
                    [rejected addObject:@{@"name": url.lastPathComponent, @"reason": failure ?: @"failed"}];
                }
            }
            dispatch_async(dispatch_get_main_queue(), ^{
                replyHandler(@{@"files": files, @"rejected": rejected}, nil);
            });
        });
    };
    if (self.window) {
        [panel beginSheetModalForWindow:self.window completionHandler:finish];
    } else {
        [panel beginWithCompletionHandler:finish];
    }
}

/// Siempre a la Papelera, nunca borrado definitivo; una subclase de prueba lo intercepta.
- (BOOL)trashItemAtURL:(NSURL *)url {
    return [NSFileManager.defaultManager trashItemAtURL:url resultingItemURL:nil error:nil];
}

- (NSTimeInterval)minimumAgeForCollection {
    return kArchivoMinAgeForCollection;
}

/// La carpeta de respaldos; un puente de prueba la reemplaza.
- (NSURL *)backupsDirectory {
    return DocumentsSubfolder(@"Respaldos", NO, nil);
}

/// Los PDF que ningún proyecto ni respaldo nombra y que llevan más de una semana en la carpeta van a la Papelera.
- (NSUInteger)collectUnreferencedIn:(NSURL *)directory referenced:(NSSet<NSString *> *)referenced {
    NSFileManager *manager = NSFileManager.defaultManager;
    NSArray<NSURL *> *entries = [manager contentsOfDirectoryAtURL:directory
                                       includingPropertiesForKeys:@[NSURLContentModificationDateKey, NSURLCreationDateKey, NSURLAddedToDirectoryDateKey]
                                                          options:NSDirectoryEnumerationSkipsHiddenFiles
                                                            error:nil];
    NSMutableArray<NSURL *> *candidates = [NSMutableArray array];
    for (NSURL *entry in entries) {
        NSString *fileId = entry.lastPathComponent.stringByDeletingPathExtension;
        if (![entry.pathExtension isEqualToString:@"pdf"] || !IsValidFileId(fileId) || [referenced containsObject:fileId]) {
            continue;
        }
        // La fecha más reciente de las que tenga: un PDF viejo recién copiado no es viejo para esta carpeta.
        NSDate *newest = nil;
        for (NSURLResourceKey key in @[NSURLContentModificationDateKey, NSURLCreationDateKey, NSURLAddedToDirectoryDateKey]) {
            NSDate *date = nil;
            [entry getResourceValue:&date forKey:key error:nil];
            if (date && (!newest || [date compare:newest] == NSOrderedDescending)) newest = date;
        }
        // Sin ninguna fecha legible no se sabe cuánto lleva ahí: se conserva.
        if (newest && -[newest timeIntervalSinceNow] > [self minimumAgeForCollection]) {
            [candidates addObject:entry];
        }
    }
    if (candidates.count == 0) {
        return 0;
    }
    // Un respaldo que nombra el archivo puede restaurar un proyecto que lo usa: ese PDF se queda.
    // Si no se puede leer la carpeta de respaldos o alguno de ellos, no se recolecta nada: no hay forma de
    // saber qué nombran. Que la carpeta no exista (nunca hubo respaldos) sí es una respuesta válida.
    NSURL *backups = [self backupsDirectory];
    NSMutableArray<NSString *> *backupTexts = [NSMutableArray array];
    NSError *listError = nil;
    NSArray<NSURL *> *backupEntries = [manager contentsOfDirectoryAtURL:backups includingPropertiesForKeys:nil options:NSDirectoryEnumerationSkipsHiddenFiles error:&listError];
    if (!backupEntries) {
        BOOL missing = [listError.domain isEqualToString:NSCocoaErrorDomain] && listError.code == NSFileReadNoSuchFileError;
        if (!missing) return 0;
        backupEntries = @[];
    }
    for (NSURL *backup in backupEntries) {
        if ([backup.pathExtension isEqualToString:@"json"]) {
            NSString *text = [NSString stringWithContentsOfURL:backup encoding:NSUTF8StringEncoding error:nil];
            if (!text) return 0;
            [backupTexts addObject:text];
        }
    }
    NSUInteger trashed = 0;
    for (NSURL *candidate in candidates) {
        NSString *fileId = candidate.lastPathComponent.stringByDeletingPathExtension;
        BOOL named = NO;
        for (NSString *text in backupTexts) {
            if ([text rangeOfString:fileId].location != NSNotFound) {
                named = YES;
                break;
            }
        }
        if (!named && [self trashItemAtURL:candidate]) {
            trashed++;
        }
    }
    return trashed;
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message
                 replyHandler:(void (^)(id reply, NSString *errorMessage))replyHandler {
    NSDictionary *body = [message.body isKindOfClass:NSDictionary.class] ? message.body : nil;
    NSString *action = [body[@"action"] isKindOfClass:NSString.class] ? body[@"action"] : @"";
    BOOL readOnlyAction = [@[@"list", @"reveal", @"open-external"] containsObject:action];
    if (self.readOnly && !readOnlyAction) {
        replyHandler(nil, @"Acción no permitida en esta ventana.");
        return;
    }
    NSError *error = nil;
    BOOL writesFiles = [@[@"save", @"pick"] containsObject:action];
    NSURL *directory = DocumentsSubfolder(@"Archivos", writesFiles, &error);
    if (!directory) {
        replyHandler(nil, error.localizedDescription ?: @"No se pudo preparar la carpeta de archivos.");
        return;
    }

    if ([action isEqualToString:@"list"]) {
        NSMutableArray *ids = [NSMutableArray array];
        for (NSURL *entry in [NSFileManager.defaultManager contentsOfDirectoryAtURL:directory includingPropertiesForKeys:nil options:NSDirectoryEnumerationSkipsHiddenFiles error:nil]) {
            NSString *fileId = entry.lastPathComponent.stringByDeletingPathExtension;
            if ([entry.pathExtension isEqualToString:@"pdf"] && ArchivoURL(fileId, directory)) [ids addObject:fileId];
        }
        replyHandler(@{@"ids": ids}, nil);
        return;
    }

    if ([action isEqualToString:@"pick"]) {
        id replaceId = body[@"replaceId"];
        if (replaceId && !IsValidFileId(replaceId)) {
            replyHandler(nil, @"Identificador de archivo inválido.");
            return;
        }
        [self pickWithDirectory:directory replaceId:replaceId reply:replyHandler];
        return;
    }

    if ([action isEqualToString:@"gc"]) {
        NSMutableSet<NSString *> *referenced = [NSMutableSet set];
        for (id fileId in [body[@"referenced"] isKindOfClass:NSArray.class] ? body[@"referenced"] : @[]) {
            if (IsValidFileId(fileId)) [referenced addObject:fileId];
        }
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
            NSUInteger trashed = [self collectUnreferencedIn:directory referenced:referenced];
            dispatch_async(dispatch_get_main_queue(), ^{
                replyHandler(@{@"trashed": @(trashed)}, nil);
            });
        });
        return;
    }

    NSURL *fileURL = ArchivoURL(body[@"fileId"], directory);
    if (!fileURL) {
        replyHandler(nil, @"Identificador de archivo inválido.");
        return;
    }

    if ([action isEqualToString:@"save"]) {
        NSString *encoded = [body[@"data"] isKindOfClass:NSString.class] ? body[@"data"] : nil;
        NSData *data = encoded ? [[NSData alloc] initWithBase64EncodedString:encoded options:0] : nil;
        if (data.length == 0 || data.length > kMaxArchivoBytes || !HasPDFSignature(data)) {
            replyHandler(nil, @"El archivo no es un PDF válido o pesa más de 50 MB.");
            return;
        }
        if (![data writeToURL:fileURL options:NSDataWritingAtomic error:&error]) {
            replyHandler(nil, error.localizedDescription ?: @"No se pudo guardar el archivo.");
            return;
        }
        replyHandler(@{@"path": fileURL.path}, nil);
        return;
    }

    BOOL exists = [NSFileManager.defaultManager fileExistsAtPath:fileURL.path];
    if ([action isEqualToString:@"reveal"]) {
        [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[exists ? fileURL : directory]];
        replyHandler(@{@"ok": @YES}, nil);
        return;
    }
    if ([action isEqualToString:@"open-external"]) {
        if (!exists || ![[NSWorkspace sharedWorkspace] openURL:fileURL]) {
            replyHandler(nil, @"No se pudo abrir el archivo.");
            return;
        }
        replyHandler(@{@"ok": @YES}, nil);
        return;
    }
    replyHandler(nil, @"Acción de archivos desconocida.");
}

@end

/*
 * Puente para abrir un diagrama en una ventana aparte (solo lectura), por ejemplo
 * para llevarlo a un iPad usado como monitor complementario. Las ventanas
 * comparten el almacenamiento: la secundaria nunca escribe, solo lee.
 */
@interface WindowBridge : NSObject <WKScriptMessageHandlerWithReply>
@property(nonatomic, copy) void (^handler)(NSDictionary *message);
@end

@implementation WindowBridge
- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message
                 replyHandler:(void (^)(id _Nullable reply, NSString *_Nullable errorMessage))replyHandler {
    if (![message.body isKindOfClass:NSDictionary.class]) {
        replyHandler(nil, @"Mensaje inválido.");
        return;
    }
    if (self.handler) {
        self.handler((NSDictionary *)message.body);
    }
    replyHandler(@{@"ok": @YES}, nil);
}
@end

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) WKWebView *mainWebView;
@property(nonatomic) BOOL terminationPending;
@property(nonatomic) BOOL terminationReady;
@property(nonatomic, strong) WebCoordinator *coordinator;
@property(nonatomic, strong) AppSchemeHandler *schemeHandler;
@property(nonatomic, strong) BackupBridge *backupBridge;
@property(nonatomic, strong) ClaudeBridge *claudeBridge;
@property(nonatomic, strong) WindowBridge *windowBridge;
@property(nonatomic, strong) FilesBridge *filesBridge;
@property(nonatomic, strong) FilesBridge *viewerFilesBridge;
@property(nonatomic, strong) NSMutableDictionary<NSString *, NSWindow *> *viewerWindows;
@property(nonatomic, strong) NSMutableDictionary<NSString *, WebCoordinator *> *viewerCoordinators;
@end

@implementation AppDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self configureMenus];

    NSURL *iconURL = [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"AppIcon.png"];
    NSImage *applicationIcon = [[NSImage alloc] initWithContentsOfURL:iconURL];
    if (applicationIcon) {
        NSApp.applicationIconImage = applicationIcon;
    }

    NSRect frame = NSMakeRect(0, 0, 1380, 860);
    self.window = [[NSWindow alloc]
        initWithContentRect:frame
        styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                   NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
        backing:NSBackingStoreBuffered
        defer:NO];
    self.window.title = kAppName;
    self.window.backgroundColor = [NSColor colorWithWhite:0.96 alpha:1.0];
    self.window.minSize = NSMakeSize(900, 600);
    self.window.collectionBehavior = NSWindowCollectionBehaviorFullScreenPrimary;
    self.window.releasedWhenClosed = NO;
    [self.window center];

    NSURL *resourceDirectory = [NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"WebApp" isDirectory:YES];
    NSURL *indexURL = [resourceDirectory URLByAppendingPathComponent:@"index.html"];
    if (!resourceDirectory || ![[NSFileManager defaultManager] fileExistsAtPath:indexURL.path]) {
        [self presentStartupError:@"No se encontraron los recursos web dentro de la aplicación."];
        return;
    }

    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = WKWebsiteDataStore.defaultDataStore;
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;
    self.schemeHandler = [[AppSchemeHandler alloc] initWithResourceDirectory:resourceDirectory];
    [configuration setURLSchemeHandler:self.schemeHandler forURLScheme:kAppScheme];

    self.backupBridge = [[BackupBridge alloc] init];
    WKUserContentController *contentController = [[WKUserContentController alloc] init];
    [contentController addScriptMessageHandlerWithReply:self.backupBridge
                                           contentWorld:WKContentWorld.pageWorld
                                                   name:@"modeladorBackup"];
    [contentController addUserScript:[[WKUserScript alloc]
        initWithSource:
            @"(() => {"
             "window.__modeladorNativeBackup = true;"
             "const pending = new Set();"
             "window.__modeladorBridges = window.__modeladorBridges || {};"
             "window.__modeladorBridges.backup = { postMessage(message) {"
             "const call = window.webkit.messageHandlers.modeladorBackup.postMessage(message);"
             "pending.add(call);"
             "call.catch(() => undefined).finally(() => pending.delete(call));"
             "return call;"
             "} };"
             "window.__modeladorPrepareClose = async () => {"
             "window.dispatchEvent(new Event('modelador:flush-drafts'));"
             "for (let round = 0; round < 2; round += 1) {"
             "window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));"
             "await new Promise(resolve => setTimeout(resolve, 0));"
             "await Promise.allSettled([...pending]);"
             "await new Promise(resolve => setTimeout(resolve, 0));"
             "}"
             "};"
             "})();"
         injectionTime:WKUserScriptInjectionTimeAtDocumentStart
      forMainFrameOnly:YES]];
    self.windowBridge = [[WindowBridge alloc] init];
    __weak AppDelegate *weakSelf = self;
    self.windowBridge.handler = ^(NSDictionary *message) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [weakSelf handleWindowMessage:message];
        });
    };
    [contentController addScriptMessageHandlerWithReply:self.windowBridge
                                           contentWorld:WKContentWorld.pageWorld
                                                   name:@"modeladorWindows"];
    [contentController addUserScript:[[WKUserScript alloc]
        initWithSource:@"window.__modeladorNativeWindows = true; window.__modeladorNativeClipboard = true;"
         injectionTime:WKUserScriptInjectionTimeAtDocumentStart
      forMainFrameOnly:YES]];
    self.filesBridge = [[FilesBridge alloc] init];
    self.filesBridge.window = self.window;
    [contentController addScriptMessageHandlerWithReply:self.filesBridge
                                           contentWorld:WKContentWorld.pageWorld
                                                   name:@"modeladorFiles"];
    [contentController addUserScript:[[WKUserScript alloc]
        initWithSource:@"window.__modeladorNativeFiles = true;"
         injectionTime:WKUserScriptInjectionTimeAtDocumentStart
      forMainFrameOnly:YES]];
    self.viewerFilesBridge = [[FilesBridge alloc] init];
    self.viewerFilesBridge.readOnly = YES;
    // Solo la ventana principal ve las propuestas de Claude: es la única que guarda.
    self.claudeBridge = [[ClaudeBridge alloc] init];
    [contentController addScriptMessageHandlerWithReply:self.claudeBridge
                                           contentWorld:WKContentWorld.pageWorld
                                                   name:@"modeladorClaude"];
    [contentController addUserScript:[[WKUserScript alloc]
        initWithSource:
            @"window.__modeladorClaudeProposals = true;"
             "window.__modeladorBridges = window.__modeladorBridges || {};"
             "window.__modeladorBridges.claude = { postMessage(message) {"
             "return window.webkit.messageHandlers.modeladorClaude.postMessage(message);"
             "} };"
         injectionTime:WKUserScriptInjectionTimeAtDocumentStart
      forMainFrameOnly:YES]];
    configuration.userContentController = contentController;
    self.viewerWindows = [NSMutableDictionary dictionary];
    self.viewerCoordinators = [NSMutableDictionary dictionary];
    self.window.delegate = self;

    WKWebView *webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    webView.allowsMagnification = NO;
    self.coordinator = [[WebCoordinator alloc] initWithWindow:self.window];
    webView.navigationDelegate = self.coordinator;
    webView.UIDelegate = self.coordinator;

    self.mainWebView = webView;
    self.window.contentView = webView;
    [webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:[kAppScheme stringByAppendingString:@"://app/index.html"]]]];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
}

- (NSString *)stringByEncodingJSON:(id)value {
    NSData *data = [NSJSONSerialization dataWithJSONObject:@[value ?: @""] options:0 error:nil];
    NSString *array = data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"[\"\"]";
    return [array substringWithRange:NSMakeRange(1, array.length - 2)];
}

- (void)handleWindowMessage:(NSDictionary *)message {
    NSString *action = [message[@"action"] isKindOfClass:NSString.class] ? message[@"action"] : @"";
    if ([action isEqualToString:@"copy-text"]) {
        // El esquema propio de la app no cuenta como origen seguro para la API del portapapeles.
        if ([message[@"text"] isKindOfClass:NSString.class]) {
            [NSPasteboard.generalPasteboard clearContents];
            [NSPasteboard.generalPasteboard setString:message[@"text"] forType:NSPasteboardTypeString];
        }
        return;
    }
    NSString *projectId = [message[@"projectId"] isKindOfClass:NSString.class] ? message[@"projectId"] : @"";
    NSString *artifactId = [message[@"artifactId"] isKindOfClass:NSString.class] ? message[@"artifactId"] : @"";
    NSString *title = [message[@"title"] isKindOfClass:NSString.class] ? message[@"title"] : kAppName;
    if ([action isEqualToString:@"open"] && [message[@"kind"] isEqual:@"file"]) {
        NSString *fileId = message[@"fileId"];
        if (projectId.length > 0 && IsValidFileId(fileId)) {
            [self openViewerForProject:projectId item:fileId title:title hashPrefix:@"#archivo="];
        }
        return;
    }
    if (projectId.length == 0 || artifactId.length == 0) {
        return;
    }
    if ([action isEqualToString:@"open"]) {
        [self openViewerForProject:projectId item:artifactId title:title hashPrefix:@"#viewer="];
    } else if ([action isEqualToString:@"focus-main"]) {
        [self focusMainWindowOnProject:projectId artifact:artifactId];
    }
}

/// Otra pantalla (el iPad en Sidecar) si hay una; si no, al lado de la ventana principal.
- (NSRect)frameForViewerWindow {
    NSSize size = NSMakeSize(980, 720);
    NSScreen *mainScreen = self.window.screen ?: NSScreen.mainScreen;
    NSScreen *otherScreen = nil;
    for (NSScreen *screen in NSScreen.screens) {
        if (screen != mainScreen) {
            otherScreen = screen;
            break;
        }
    }
    NSRect area = (otherScreen ?: mainScreen).visibleFrame;
    if (otherScreen) {
        size.width = MIN(size.width, area.size.width);
        size.height = MIN(size.height, area.size.height);
        return NSMakeRect(NSMidX(area) - size.width / 2, NSMidY(area) - size.height / 2, size.width, size.height);
    }
    NSRect main = self.window.frame;
    CGFloat count = (CGFloat)self.viewerWindows.count;
    return NSMakeRect(main.origin.x + 60 + 28 * count, MAX(area.origin.y, main.origin.y - 40 - 28 * count), size.width, size.height);
}

- (void)openViewerForProject:(NSString *)projectId item:(NSString *)itemId title:(NSString *)title hashPrefix:(NSString *)hashPrefix {
    // Un diagrama y un PDF tienen ids distintos, así que comparten el mismo mapa de ventanas.
    NSString *key = [NSString stringWithFormat:@"%@/%@", projectId, itemId];
    NSWindow *existing = self.viewerWindows[key];
    if (existing) {
        [existing makeKeyAndOrderFront:nil];
        return;
    }

    NSWindow *viewerWindow = [[NSWindow alloc]
        initWithContentRect:[self frameForViewerWindow]
        styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                   NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
        backing:NSBackingStoreBuffered
        defer:NO];
    viewerWindow.title = title;
    viewerWindow.minSize = NSMakeSize(420, 320);
    viewerWindow.collectionBehavior = NSWindowCollectionBehaviorFullScreenPrimary;
    viewerWindow.releasedWhenClosed = NO;
    viewerWindow.delegate = self;

    // Misma tienda de datos y mismo esquema, pero sin el puente de respaldos:
    // la ventana secundaria nunca guarda proyectos.
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = WKWebsiteDataStore.defaultDataStore;
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;
    [configuration setURLSchemeHandler:self.schemeHandler forURLScheme:kAppScheme];
    WKUserContentController *contentController = [[WKUserContentController alloc] init];
    [contentController addScriptMessageHandlerWithReply:self.windowBridge
                                           contentWorld:WKContentWorld.pageWorld
                                                   name:@"modeladorWindows"];
    // Los PDF se leen por el esquema de la app; el puente de solo consulta sirve para «Abrir en Vista Previa».
    [contentController addScriptMessageHandlerWithReply:self.viewerFilesBridge
                                           contentWorld:WKContentWorld.pageWorld
                                                   name:@"modeladorFiles"];
    [contentController addUserScript:[[WKUserScript alloc]
        initWithSource:@"window.__modeladorNativeWindows = true; window.__modeladorNativeFiles = true;"
         injectionTime:WKUserScriptInjectionTimeAtDocumentStart
      forMainFrameOnly:YES]];
    configuration.userContentController = contentController;

    WKWebView *webView = [[WKWebView alloc] initWithFrame:NSZeroRect configuration:configuration];
    webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    webView.allowsMagnification = NO;
    WebCoordinator *coordinator = [[WebCoordinator alloc] initWithWindow:viewerWindow];
    webView.navigationDelegate = coordinator;
    webView.UIDelegate = coordinator;
    viewerWindow.contentView = webView;

    NSString *hash = [NSString stringWithFormat:@"%@%@/%@", hashPrefix,
        [projectId stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLQueryAllowedCharacterSet],
        [itemId stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLQueryAllowedCharacterSet]];
    NSString *address = [[kAppScheme stringByAppendingString:@"://app/index.html"] stringByAppendingString:hash];
    [webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:address]]];

    self.viewerWindows[key] = viewerWindow;
    self.viewerCoordinators[key] = coordinator;
    [viewerWindow makeKeyAndOrderFront:nil];
}

- (void)focusMainWindowOnProject:(NSString *)projectId artifact:(NSString *)artifactId {
    if (self.window.isMiniaturized) {
        [self.window deminiaturize:nil];
    }
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    NSString *script = [NSString stringWithFormat:
        @"window.dispatchEvent(new CustomEvent('modelador:select-artifact', {detail: {projectId: %@, artifactId: %@}}));",
        [self stringByEncodingJSON:projectId], [self stringByEncodingJSON:artifactId]];
    [self.mainWebView evaluateJavaScript:script completionHandler:nil];
}

- (void)windowWillClose:(NSNotification *)notification {
    NSWindow *closing = notification.object;
    if (closing == self.window) {
        // Sin la principal no hay con qué editar: las vistas se cierran con ella.
        for (NSWindow *viewer in [self.viewerWindows.allValues copy]) {
            [viewer close];
        }
        return;
    }
    for (NSString *key in [self.viewerWindows.allKeys copy]) {
        if (self.viewerWindows[key] == closing) {
            [self.viewerWindows removeObjectForKey:key];
            [self.viewerCoordinators removeObjectForKey:key];
        }
    }
}

- (BOOL)windowShouldClose:(NSWindow *)sender {
    if (sender != self.window || self.terminationReady) return YES;
    [NSApp terminate:nil];
    return NO;
}

- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    if (self.terminationReady || self.mainWebView == nil) return NSTerminateNow;
    if (self.terminationPending) return NSTerminateLater;
    self.terminationPending = YES;

    __weak AppDelegate *weakSelf = self;
    void (^finish)(void) = ^{
        AppDelegate *strongSelf = weakSelf;
        if (strongSelf == nil || !strongSelf.terminationPending) return;
        strongSelf.terminationPending = NO;
        strongSelf.terminationReady = YES;
        [sender replyToApplicationShouldTerminate:YES];
    };
    [self.mainWebView callAsyncJavaScript:@"await window.__modeladorPrepareClose?.();"
                              arguments:@{}
                                inFrame:nil
                         inContentWorld:WKContentWorld.pageWorld
                      completionHandler:^(id result, NSError *error) {
        // Always reply after applicationShouldTerminate has returned.
        dispatch_async(dispatch_get_main_queue(), finish);
    }];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.5 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), finish);
    return NSTerminateLater;
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (BOOL)applicationSupportsSecureRestorableState:(NSApplication *)app {
    return YES;
}

- (void)presentStartupError:(NSString *)message {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = [@"No se pudo abrir " stringByAppendingString:kAppName];
    alert.informativeText = message;
    [alert runModal];
    [NSApp terminate:nil];
}

- (void)configureMenus {
    NSMenu *mainMenu = [[NSMenu alloc] init];

    NSMenuItem *applicationMenuItem = [[NSMenuItem alloc] init];
    NSMenu *applicationMenu = [[NSMenu alloc] initWithTitle:@"Aplicación"];
    [applicationMenu addItemWithTitle:[@"Acerca de " stringByAppendingString:kAppName]
                               action:@selector(orderFrontStandardAboutPanel:)
                        keyEquivalent:@""];
    [applicationMenu addItem:NSMenuItem.separatorItem];
    [applicationMenu addItemWithTitle:[@"Salir de " stringByAppendingString:kAppName]
                               action:@selector(terminate:)
                        keyEquivalent:@"q"];
    applicationMenuItem.submenu = applicationMenu;
    [mainMenu addItem:applicationMenuItem];

    NSMenuItem *editMenuItem = [[NSMenuItem alloc] init];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edición"];
    [editMenu addItemWithTitle:@"Deshacer" action:@selector(undo:) keyEquivalent:@"z"];
    NSMenuItem *redo = [editMenu addItemWithTitle:@"Rehacer" action:@selector(redo:) keyEquivalent:@"z"];
    redo.keyEquivalentModifierMask = NSEventModifierFlagCommand | NSEventModifierFlagShift;
    [editMenu addItem:NSMenuItem.separatorItem];
    [editMenu addItemWithTitle:@"Cortar" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copiar" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Pegar" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Seleccionar todo" action:@selector(selectAll:) keyEquivalent:@"a"];
    editMenuItem.submenu = editMenu;
    [mainMenu addItem:editMenuItem];

    NSMenuItem *windowMenuItem = [[NSMenuItem alloc] init];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Ventana"];
    [windowMenu addItemWithTitle:@"Minimizar" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
    [windowMenu addItem:NSMenuItem.separatorItem];
    NSMenuItem *fullScreen = [windowMenu addItemWithTitle:@"Entrar en pantalla completa"
                                                   action:@selector(toggleFullScreen:)
                                            keyEquivalent:@"f"];
    fullScreen.keyEquivalentModifierMask = NSEventModifierFlagControl | NSEventModifierFlagCommand;
    windowMenuItem.submenu = windowMenu;
    [mainMenu addItem:windowMenuItem];
    NSApp.windowsMenu = windowMenu;
    NSApp.mainMenu = mainMenu;
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        AppDelegate *delegate = [[AppDelegate alloc] init];
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
