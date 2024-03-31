package io.github.detachhead.basedpyright

import com.intellij.ide.ApplicationInitializedListener
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.roots.ProjectRootManager
import kotlinx.coroutines.CoroutineScope
import org.wso2.lsp4intellij.IntellijLanguageClient
import org.wso2.lsp4intellij.client.languageserver.serverdefinition.RawCommandServerDefinition

class BasedPyrightPreloadingActivity : ApplicationInitializedListener {
    override suspend fun execute(asyncScope: CoroutineScope) {
        IntellijLanguageClient.addServerDefinition(
            RawCommandServerDefinition(
                "py",
                arrayOf(
//                    ProjectRootManager.getInstance(ProjectManager.getInstance().defaultProject).projectSdk.toString(),
//                    "langserver.py"
                    "node", "langserver.index.js"
                )

            )
        )
    }
}
