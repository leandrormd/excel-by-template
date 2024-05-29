import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError
} from 'n8n-workflow';
import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

export class ExcelByTemplate implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Excel By Template',
		name: 'excelByTemplate',
		icon: 'file:excelByTemplate.svg',
		group: ['transform'],
		version: 1,
		description: 'Create Excel By Template',
		defaults: {
			name: 'ExcelByTemplate',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Template File',
				name: 'templateFile',
				type: 'string',
				required: true,
				default: '',
				description: 'Template File',
				typeOptions: {
					requiresDataPath: 'multiple',
				}
			},
			{
				displayName: 'Start Row',
				name: 'startRow',
				type: 'number',
				required: true,
				default: 1,
				description: 'Start Row',
				typeOptions: {
					minValue: 1
				}
			},
			{
				displayName: 'Columns',
				name: 'columnsConfig',
				placeholder: 'Add Columns',
				type: 'fixedCollection',
				required: true,
				default: {},
				typeOptions: {
					multipleValues: true,
				},
				description: 'Add Columns',
				options: [
					{
						name: 'indexColumn',
						displayName: 'Index Column',
						values: [
							{
								displayName: 'Index',
								name: 'index',
								type: 'number',
								default: 1,
								typeOptions: {
									minValue: 1
								}
							},
							{
								displayName: 'Property',
								name: 'property',
								type: 'string',
								typeOptions: {
									requiresDataPath: 'single'
								},
								default: '',
								description: 'Set property column',
							},
						],
					},
				]
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {

		const tempPath: string = `temp_${uuidv4()}.xlsx`;

		try {

			const templateFile = this.getNodeParameter('templateFile', 0) as string;
			const startRow = this.getNodeParameter('startRow', 0) as number;
			const columnsConfig = this.getNodeParameter('columnsConfig', 0) as IDataObject;

			if (!columnsConfig.indexColumn) {
				throw new NodeOperationError(this.getNode(), 'no configuration columns');
			}

			let newItem: INodeExecutionData = {
				json: {},
				binary: {}
			};

			const columns = columnsConfig.indexColumn as IDataObject[];

			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.readFile(templateFile);
			let worksheet = workbook.getWorksheet(1);

			const items = this.getInputData();

			if (worksheet) {
				for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
					try {

						columns.forEach((col) => {

							const colProperty = col.property as string;
							const colIndex = col.index as number;

							const data = items[itemIndex].json[colProperty] as null | number | string | boolean | Date | undefined;

							const rowData = worksheet?.getRow(itemIndex + startRow);
							if (rowData) {
								rowData.getCell(colIndex).value = data;
								rowData.commit();
							}

						});

					} catch (error) {
						if (this.continueOnFail()) {
							items.push({json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex});
						} else {
							if (error.context) {
								error.context.itemIndex = itemIndex;
								throw error;
							}
							throw new NodeOperationError(this.getNode(), error, {
								itemIndex,
							});
						}
					}
				}

				const buffer =  await workbook.xlsx.writeBuffer();

				newItem.binary!['data'] = await this.helpers.prepareBinaryData(Buffer.from(buffer), tempPath);

			} else {
				throw new NodeOperationError(this.getNode(), 'no worksheet', {})
			}

			let returnData: INodeExecutionData[] = [];
			returnData.push(newItem)

			return this.prepareOutputData(returnData);

		} finally {
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}
		}
	}
}

