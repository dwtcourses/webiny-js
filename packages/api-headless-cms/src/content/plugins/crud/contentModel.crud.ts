import { ContextPlugin } from "@webiny/handler/types";
import {
    CmsContext,
    CmsContentModelType,
    CmsContentModelContextType,
    CmsContentModelManagerInterface,
    ContentModelManagerPlugin
} from "@webiny/api-headless-cms/types";
import { defaults } from "../../../utils";
import { plugins } from "@webiny/plugins";

// eslint-disable-next-line
const createContentModelPk = (context: any) => {
    return "contentModel#pk";
};

const defaultName = "content-model-manager-default";

const contentModelManagerFactory = async (context: CmsContext, model: CmsContentModelType) => {
    const pluginsByType = plugins.byType<ContentModelManagerPlugin>("content-model-manager");
    for (const plugin of pluginsByType) {
        const target = Array.isArray(plugin.targetCode) ? plugin.targetCode : [plugin.targetCode];
        if (target.includes(model.modelId) === true && plugin.name !== defaultName) {
            return await plugin.create(context, model);
        }
    }
    const plugin = pluginsByType.find(plugin => plugin.name === defaultName);
    if (!plugin) {
        throw new Error("There is no default plugin to create ContentModelManager");
    }
    return await plugin.create(context, model);
};
export default (): ContextPlugin<CmsContext> => ({
    type: "context",
    name: "context-content-model-crud",
    async apply(context) {
        const { db } = context;

        // manager per request - something similar to dataloader
        const managers = new Map<string, CmsContentModelManagerInterface<any>>();
        const updateManager = async <T>(
            context: CmsContext,
            model: CmsContentModelType
        ): Promise<CmsContentModelManagerInterface<T>> => {
            const manager = await contentModelManagerFactory(context, model);
            managers.set(model.modelId, manager);
            return (manager as unknown) as CmsContentModelManagerInterface<T>;
        };

        const models: CmsContentModelContextType = {
            async get(id) {
                const [response] = await db.read<CmsContentModelType>({
                    ...defaults.db,
                    query: { PK: createContentModelPk(context), SK: id },
                    limit: 1
                });
                if (!response || response.length === 0) {
                    return null;
                }
                return response.find(() => true);
            },
            async list() {
                const [response] = await db.read<CmsContentModelType>({
                    ...defaults.db,
                    query: { PK: createContentModelPk(context), SK: { $gt: " " } }
                });
                return response;
            },
            async create() {
                const model = {} as any;

                await updateManager(context, model);
                return model;
            },
            async update(model, data) {
                await updateManager(context, model);

                return {
                    ...model,
                    ...data
                };
            },
            async delete(model) {
                managers.delete(model.modelId);
                return;
            },
            async getManager<T = any>(modelId) {
                if (managers.has(modelId)) {
                    return managers.get(modelId);
                }
                const models = await context.cms.models.list();
                const model = models.find(m => m.modelId === modelId);
                if (!model) {
                    throw new Error(`There is no content model "${modelId}".`);
                }
                return await updateManager<T>(context, model);
            },
            getManagers: () => managers
        };

        context.cms = {
            ...(context.cms || ({} as any)),
            models,
            getModel: (modelId: string) => {
                return models.getManager(modelId);
            }
        };
    }
});
