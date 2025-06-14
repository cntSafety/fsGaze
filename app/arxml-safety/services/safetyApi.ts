// API service layer abstraction for safety operations
import { message } from 'antd';
import { getApplicationSwComponents } from '../../services/neo4j/queries/components';
import { 
  getFailuresForSwComponents, 
  createFailureNode, 
  deleteFailureNode 
} from '../../services/neo4j/queries/safety';
import { ApiResponse, SwComponent, Failure, SafetyTableRow } from '../types';
import { PLACEHOLDER_VALUES, MESSAGES } from '../utils/constants';

export class SafetyApiService {
  /**
   * Get all SW components
   */
  static async getSwComponents(): Promise<ApiResponse<SwComponent[]>> {
    try {
      const result = await getApplicationSwComponents();
      return result;
    } catch (error) {
      console.error('Error fetching SW components:', error);
      return {
        success: false,
        message: 'Failed to fetch SW components'
      };
    }
  }

  /**
   * Get failures for a specific SW component
   */
  static async getComponentFailures(componentUuid: string): Promise<ApiResponse<Failure[]>> {
    try {
      const result = await getFailuresForSwComponents(componentUuid);
      return result;
    } catch (error) {
      console.error('Error fetching component failures:', error);
      return {
        success: false,
        message: 'Failed to fetch component failures'
      };
    }
  }

  /**
   * Create a new failure mode
   */
  static async createFailure(
    componentUuid: string,
    failureName: string,
    failureDescription: string,
    asil: string
  ): Promise<ApiResponse<any>> {
    try {
      const result = await createFailureNode(componentUuid, failureName, failureDescription, asil);
      if (result.success) {
        message.success(MESSAGES.SUCCESS.FAILURE_ADDED);
      } else {
        message.error(`Error: ${result.message}`);
      }
      return result;
    } catch (error) {
      console.error('Error creating failure:', error);
      message.error(MESSAGES.ERROR.SAVE_FAILED);
      return {
        success: false,
        message: 'Failed to create failure mode'
      };
    }
  }

  /**
   * Delete a failure mode
   */
  static async deleteFailure(failureUuid: string): Promise<ApiResponse<any>> {
    try {
      const result = await deleteFailureNode(failureUuid);
      if (result.success) {
        message.success(MESSAGES.SUCCESS.FAILURE_DELETED);
      } else {
        message.error(`Error deleting failure: ${result.message}`);
      }
      return result;
    } catch (error) {
      console.error('Error deleting failure:', error);
      message.error(MESSAGES.ERROR.DELETE_FAILED);
      return {
        success: false,
        message: 'Failed to delete failure mode'
      };
    }
  }

  /**
   * Build table data from SW components and their failures
   */
  static async buildTableData(): Promise<SafetyTableRow[]> {
    const swComponentsResult = await this.getSwComponents();
    
    if (!swComponentsResult.success || !swComponentsResult.data) {
      throw new Error(swComponentsResult.message || 'Failed to load components');
    }

    const tableRows: SafetyTableRow[] = [];

    // Get failures for each SW component and create table rows
    for (const component of swComponentsResult.data) {
      const failuresResult = await this.getComponentFailures(component.uuid);
      
      if (failuresResult.success && failuresResult.data && failuresResult.data.length > 0) {
        // Create rows for existing failures
        failuresResult.data.forEach((failure) => {
          tableRows.push({
            key: `${component.uuid}-${failure.failureUuid}`,
            swComponentUuid: component.uuid,
            swComponentName: component.name,
            failureName: failure.failureName || '',
            failureDescription: failure.failureDescription || '',
            asil: failure.asil || PLACEHOLDER_VALUES.DEFAULT_ASIL,
            failureUuid: failure.failureUuid
          });
        });
      } else {
        // Create a placeholder row for components with no failures
        tableRows.push({
          key: `${component.uuid}-empty`,
          swComponentUuid: component.uuid,
          swComponentName: component.name,
          failureName: PLACEHOLDER_VALUES.NO_FAILURES,
          failureDescription: PLACEHOLDER_VALUES.NO_DESCRIPTION,
          asil: PLACEHOLDER_VALUES.NO_DESCRIPTION
        });
      }
    }

    // Sort table rows by component name to ensure proper grouping
    return this.sortTableData(tableRows);
  }

  /**
   * Sort table data for proper grouping
   */
  private static sortTableData(tableRows: SafetyTableRow[]): SafetyTableRow[] {
    return tableRows.sort((a, b) => {
      if (a.swComponentName && b.swComponentName && a.swComponentName !== b.swComponentName) {
        return a.swComponentName.localeCompare(b.swComponentName);
      }
      // Within the same component, put 'No failures defined' last
      if (a.failureName === PLACEHOLDER_VALUES.NO_FAILURES) return 1;
      if (b.failureName === PLACEHOLDER_VALUES.NO_FAILURES) return -1;
      return a.failureName.localeCompare(b.failureName);
    });
  }
}
